import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { giveawayCampaigns, giveawayState, normalizeGiveawayEmail } from "./giveawayCampaigns";

export type GiveawayContact = { email: string; eligibilityConfirmed: boolean; marketingConsent: boolean };

type EntryOrigin =
  | { entryMethod: "assessment"; attemptId: Id<"assessmentAttempts"> }
  | { entryMethod: "alternate"; firstName: string; lastName: string };

/** Both entry methods use this same indexed read/insert in their mutation transaction. */
export async function recordGiveawayEntry(ctx: MutationCtx, campaignId: string, now: number, contact: GiveawayContact & { rulesAcknowledged: boolean }, origin: EntryOrigin) {
  const campaign = Object.prototype.hasOwnProperty.call(giveawayCampaigns, campaignId) ? giveawayCampaigns[campaignId] : undefined;
  if (!campaign || giveawayState(campaign, now) !== "active") throw new Error("Giveaway entries are not open");
  const normalizedEmail = normalizeGiveawayEmail(contact.email);
  if (!contact.eligibilityConfirmed) throw new Error("Confirm giveaway eligibility before entering");
  if (!contact.rulesAcknowledged) throw new Error("Acknowledge the Official Rules before entering");
  // The campaign/email index deliberately does NOT include method: one combined pool.
  const existing = await ctx.db.query("giveawayEntries").withIndex("by_campaign_email", q => q.eq("campaignId", campaignId).eq("normalizedEmail", normalizedEmail)).unique();
  if (existing) return { outcome: "duplicate" as const, entryId: existing._id };
  const entryId = await ctx.db.insert("giveawayEntries", {
    campaignId, ...origin, normalizedEmail, originalEmail: contact.email.trim(),
    qualifiedAt: now, status: "qualified", rulesVersion: campaign.rulesVersion,
    eligibilityConfirmedAt: now, rulesAcknowledgedAt: now, marketingConsent: contact.marketingConsent,
    marketingConsentAt: contact.marketingConsent ? now : undefined,
    consentVersion: contact.marketingConsent ? "giveaway_followup_v1" : undefined,
  });
  return { outcome: "qualified" as const, entryId };
}

/** Called only from canonical assessment completion, in the same Convex transaction. */
export async function qualifyGiveaway(ctx: MutationCtx, attempt: Doc<"assessmentAttempts">, now: number, contact?: GiveawayContact) {
  const campaignId = attempt.sourceSnapshot?.utmCampaign;
  if (!campaignId || attempt.sourceSnapshot?.utmSource !== "giveaway") return;
  const campaign = giveawayCampaigns[campaignId];
  if (!campaign || giveawayState(campaign, now) !== "active") {
    await ctx.db.patch(attempt._id, { giveawayOutcome: "outside_period" });
    return;
  }
  if (!contact) throw new Error("A contact email is required for giveaway entry");
  // Existing Assessment checkbox explicitly confirms both eligibility and rules.
  const { outcome } = await recordGiveawayEntry(ctx, campaignId, now, { ...contact, rulesAcknowledged: contact.eligibilityConfirmed }, { entryMethod: "assessment", attemptId: attempt._id });
  await ctx.db.patch(attempt._id, { giveawayOutcome: outcome });
  await ctx.db.insert("assessmentEvents", {
    attemptId: attempt._id,
    eventKey: outcome === "duplicate" ? "giveaway_duplicate_entry_detected" : "giveaway_entry_qualified",
    deduplicationKey: `${attempt._id}:giveaway_entry`, language: attempt.responseLanguage,
    metadata: { campaignId }, createdAt: now,
  });
}
