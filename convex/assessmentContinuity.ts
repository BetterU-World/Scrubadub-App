import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import { checkRateLimit } from "./lib/rateLimit";
import { hashTokenForLookup } from "./lib/tokenHash";

const TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000;
const CONSENT_VERSION = "assessment_followup_v1";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (value: string | undefined, max: number) => {
  const result = value?.replace(/[\u0000-\u001F\u007F<>]/g, "").trim();
  if (result && result.length > max)
    throw new Error("Please shorten this field");
  return result || undefined;
};
async function milestone(
  ctx: any,
  attemptId: any,
  eventKey: string,
  language: "en" | "es",
) {
  const deduplicationKey = `${attemptId}:${eventKey}`;
  const existing = await ctx.db
    .query("assessmentEvents")
    .withIndex("by_deduplicationKey", (q: any) =>
      q.eq("deduplicationKey", deduplicationKey),
    )
    .unique();
  if (!existing)
    await ctx.db.insert("assessmentEvents", {
      attemptId,
      eventKey,
      deduplicationKey,
      language,
      createdAt: Date.now(),
    });
}

export const prepareDelivery = internalMutation({
  args: {
    attemptId: v.id("assessmentAttempts"),
    capability: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    businessName: v.optional(v.string()),
    language: v.union(v.literal("en"), v.literal("es")),
    marketingConsent: v.boolean(),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (
      !attempt ||
      attempt.capabilityHash !== (await hashTokenForLookup(args.capability)) ||
      attempt.status !== "completed" ||
      !attempt.reportSnapshot ||
      !attempt.roadmapSnapshot
    )
      throw new Error("Assessment is unavailable");
    const normalizedEmail = args.email.trim().toLowerCase();
    if (normalizedEmail.length > 254 || !emailPattern.test(normalizedEmail))
      throw new Error("Enter a valid email address");
    await checkRateLimit(ctx, {
      key: `assessment:delivery:${attempt.capabilityHash}`,
      limit: 3,
      windowMs: 60 * 60 * 1000,
    });
    const now = Date.now();
    const existing = await ctx.db
      .query("assessmentProspects")
      .withIndex("by_attemptId", (q) => q.eq("attemptId", attempt._id))
      .unique();
    const values = {
      normalizedEmail,
      firstName: clean(args.firstName, 80),
      businessName: clean(args.businessName, 120),
      preferredLanguage: args.language,
      deliveryAuthorizedAt: now,
      marketingConsent: args.marketingConsent,
      marketingConsentAt: args.marketingConsent ? now : undefined,
      consentVersion: args.marketingConsent ? CONSENT_VERSION : undefined,
      scrubInterest: existing?.scrubInterest ?? ("unspecified" as const),
      scrubInterestAt: existing?.scrubInterestAt,
      deliveryStatus: "pending" as const,
      reportVersion: attempt.reportSnapshot.reportContentVersion,
      roadmapVersion: attempt.roadmapSnapshot.roadmapVersion,
      source: "assessment_report" as const,
      updatedAt: now,
    };
    const prospectId = existing
      ? (await ctx.db.patch(existing._id, values), existing._id)
      : await ctx.db.insert("assessmentProspects", {
          attemptId: attempt._id,
          ...values,
          createdAt: now,
        });
    const tokens = await ctx.db
      .query("assessmentReportTokens")
      .withIndex("by_attemptId", (q) => q.eq("attemptId", attempt._id))
      .collect();
    for (const row of tokens)
      if (!row.revokedAt) await ctx.db.patch(row._id, { revokedAt: now });
    const tokenHash = await hashTokenForLookup(args.token);
    await ctx.db.insert("assessmentReportTokens", {
      attemptId: attempt._id,
      prospectId,
      tokenHash,
      scope: "assessment_report_read",
      createdAt: now,
      expiresAt: now + TOKEN_TTL_MS,
    });
    await milestone(ctx, attempt._id, "report_link_requested", args.language);
    return { prospectId, normalizedEmail, expiresAt: now + TOKEN_TTL_MS };
  },
});

export const finishDelivery = internalMutation({
  args: { prospectId: v.id("assessmentProspects"), delivered: v.boolean() },
  handler: async (ctx, args) => {
    const prospect = await ctx.db.get(args.prospectId);
    if (!prospect) return;
    await ctx.db.patch(args.prospectId, {
      deliveryStatus: args.delivered ? "delivered" : "failed",
      updatedAt: Date.now(),
    });
    await milestone(
      ctx,
      prospect.attemptId,
      args.delivered ? "report_email_delivered" : "report_email_failed",
      prospect.preferredLanguage,
    );
  },
});

export const openReturnLink = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    if (!/^[a-f0-9]{64}$/i.test(args.token))
      throw new Error("This assessment link is invalid or expired");
    const hash = await hashTokenForLookup(args.token);
    await checkRateLimit(ctx, {
      key: "assessment:return:global",
      limit: 100,
      windowMs: 60_000,
    });
    await checkRateLimit(ctx, {
      key: `assessment:return:${hash.slice(0, 16)}`,
      limit: 10,
      windowMs: 60_000,
    });
    const row = await ctx.db
      .query("assessmentReportTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", hash))
      .unique();
    if (!row || row.revokedAt || row.expiresAt <= Date.now())
      throw new Error("This assessment link is invalid or expired");
    const attempt = await ctx.db.get(row.attemptId);
    if (
      !attempt?.reportSnapshot ||
      !attempt.roadmapSnapshot ||
      attempt.status !== "completed"
    )
      throw new Error("This assessment link is invalid or expired");
    if (!row.openedAt) await ctx.db.patch(row._id, { openedAt: Date.now() });
    await milestone(
      ctx,
      attempt._id,
      "secure_return_opened",
      attempt.responseLanguage,
    );
    return {
      report: attempt.reportSnapshot.payload,
      roadmap: attempt.roadmapSnapshot.payload,
      language: attempt.responseLanguage,
    };
  },
});

export const submitInterest = mutation({
  args: {
    attemptId: v.id("assessmentAttempts"),
    capability: v.string(),
    interested: v.boolean(),
  },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (
      !attempt ||
      attempt.capabilityHash !== (await hashTokenForLookup(args.capability)) ||
      attempt.status !== "completed"
    )
      throw new Error("Assessment is unavailable");
    const prospect = await ctx.db
      .query("assessmentProspects")
      .withIndex("by_attemptId", (q) => q.eq("attemptId", attempt._id))
      .unique();
    if (!prospect)
      throw new Error("Request a secure link before saving this preference");
    await ctx.db.patch(prospect._id, {
      scrubInterest: args.interested ? "interested" : "not_now",
      scrubInterestAt: Date.now(),
      updatedAt: Date.now(),
    });
    await milestone(
      ctx,
      attempt._id,
      "scrub_interest_submitted",
      attempt.responseLanguage,
    );
    return { saved: true };
  },
});

const eventMetadata = v.object({
  definitionVersion: v.optional(v.number()),
  scoringVersion: v.optional(v.number()),
  reportVersion: v.optional(v.number()),
  roadmapVersion: v.optional(v.number()),
  maturityKey: v.optional(v.string()),
  confidenceKey: v.optional(v.string()),
  branchType: v.optional(v.string()),
  scoreBand: v.optional(v.string()),
  deviceCategory: v.optional(v.union(v.literal("mobile"), v.literal("desktop"))),
  sectionKey: v.optional(v.string()),
  questionKey: v.optional(v.string()),
  sessionId: v.optional(v.string()),
});
export const recordEvent = mutation({
  args: {
    attemptId: v.optional(v.id("assessmentAttempts")),
    capability: v.optional(v.string()),
    eventKey: v.string(),
    deduplicationKey: v.string(),
    language: v.union(v.literal("en"), v.literal("es")),
    metadata: v.optional(eventMetadata),
  },
  handler: async (ctx, args) => {
    await checkRateLimit(ctx, {
      key: "assessment:event:global",
      limit: 500,
      windowMs: 60_000,
    });
    if (
      !/^[a-z_]{3,40}$/.test(args.eventKey) ||
      args.deduplicationKey.length > 160 ||
      (args.metadata?.sectionKey && !/^[a-z0-9_.-]{1,80}$/.test(args.metadata.sectionKey)) ||
      (args.metadata?.questionKey && !/^[a-z0-9_.-]{1,120}$/.test(args.metadata.questionKey)) ||
      (args.metadata?.sessionId && !/^[a-f0-9]{16,64}$/i.test(args.metadata.sessionId))
    )
      return { recorded: false };
    if (args.attemptId && ["assessment_resumed", "assessment_progress", "scrub_support_cta_clicked"].includes(args.eventKey)) {
      const attempt = await ctx.db.get(args.attemptId);
      if (!attempt || !args.capability || attempt.capabilityHash !== (await hashTokenForLookup(args.capability))) return { recorded: false };
    }
    const existing = await ctx.db
      .query("assessmentEvents")
      .withIndex("by_deduplicationKey", (q) =>
        q.eq("deduplicationKey", args.deduplicationKey),
      )
      .unique();
    if (existing) return { recorded: false };
    await ctx.db.insert("assessmentEvents", {
      attemptId: args.attemptId,
      eventKey: args.eventKey,
      deduplicationKey: args.deduplicationKey,
      language: args.language,
      metadata: args.metadata,
      createdAt: Date.now(),
    });
    return { recorded: true };
  },
});
