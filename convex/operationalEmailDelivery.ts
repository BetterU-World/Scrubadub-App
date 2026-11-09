import { internalMutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { requireOwnerSession } from "./lib/sessionAuth";
import { ensureOperationalEmail } from "./lib/operationalEmailQueue";
import { operationalEmailEvent, completionEvent, approvalEvent, deliveryState, errorCategory, attemptSummary,
  sendOutcome, MAX_EMAIL_ATTEMPTS, EMAIL_CLAIM_MS, EMAIL_RECOVERY_WINDOW_MS, EMAIL_RECOVERY_BATCH,
  retryDelay } from "./lib/operationalEmailModel";

const deliveryId = v.id("operationalEmailDeliveries");

/** Only existing queued callbacks use this bridge; never enumerate old jobs to recreate mail. */
export const adoptQueued = internalMutation({
  args: { event: v.union(completionEvent, approvalEvent, v.object({ kind: v.literal("assignment"),
    jobId: v.id("jobs"), recipientId: v.id("users"), revision: v.number() })) },
  returns: v.union(v.null(), deliveryId),
  handler: async (ctx, { event }) => {
    if (event.kind !== "assignment") return ensureOperationalEmail(ctx, event);
    const job = await ctx.db.get(event.jobId);
    return job ? ensureOperationalEmail(ctx, { ...event, companyId: job.companyId }) : null;
  },
});

async function expire(ctx: MutationCtx, row: Doc<"operationalEmailDeliveries">, now: number) {
  if (row.state !== "claimed" || row.claimExpiresAt === undefined || row.claimExpiresAt > now) return;
  await ctx.db.patch(row._id, { state: "unknown", category: "claim_expired", updatedAt: now,
    claimExpiresAt: undefined, nextAttemptAt: undefined,
    attempts: row.attempts.map(attempt => attempt.number === row.attemptCount
      ? { ...attempt, state: "unknown" as const, category: "claim_expired" as const, finishedAt: now } : attempt) });
}

export const expireClaim = internalMutation({
  args: { deliveryId, attemptNumber: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.deliveryId);
    if (row?.attemptCount === args.attemptNumber) await expire(ctx, row, Date.now());
    return null;
  },
});

export const claim = internalMutation({
  args: { deliveryId },
  returns: v.union(v.null(), v.object({ event: operationalEmailEvent, attemptNumber: v.number() })),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.deliveryId);
    if (!row) return null;
    const now = Date.now();
    if (row.state === "claimed") { await expire(ctx, row, now); return null; }
    if (!["pending", "failed"].includes(row.state) || row.nextAttemptAt === undefined || row.nextAttemptAt > now ||
        row.attemptCount >= MAX_EMAIL_ATTEMPTS) return null;
    if (now - row.createdAt >= EMAIL_RECOVERY_WINDOW_MS) {
      await ctx.db.patch(row._id, { state: "skipped", category: "retry_window_expired", nextAttemptAt: undefined, updatedAt: now });
      return null;
    }
    if (row.event.companyId !== row.companyId || row.event.jobId !== row.jobId || row.event.recipientId !== row.recipientId) {
      await ctx.db.patch(row._id, { state: "skipped", category: "ineligible", nextAttemptAt: undefined, updatedAt: now });
      return null;
    }
    const attemptNumber = row.attemptCount + 1;
    await ctx.db.patch(row._id, { state: "claimed", attemptCount: attemptNumber, updatedAt: now,
      nextAttemptAt: undefined, category: undefined, sendStartedAt: undefined, claimExpiresAt: now + EMAIL_CLAIM_MS,
      attempts: [...row.attempts, { number: attemptNumber, claimedAt: now, state: "claimed" }] });
    await ctx.scheduler.runAfter(EMAIL_CLAIM_MS, internal.operationalEmailDelivery.expireClaim, { deliveryId: row._id, attemptNumber });
    return { event: row.event, attemptNumber };
  },
});

/** A delayed action that resumes after its claim expired must not call the provider. */
export const beginSend = internalMutation({
  args: { deliveryId, attemptNumber: v.number() }, returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.deliveryId);
    if (!row || row.state !== "claimed" || row.attemptCount !== args.attemptNumber || row.sendStartedAt !== undefined) return false;
    const now = Date.now();
    if (row.claimExpiresAt === undefined || row.claimExpiresAt <= now) { await expire(ctx, row, now); return false; }
    await ctx.db.patch(row._id, { sendStartedAt: now, updatedAt: now });
    return true;
  },
});

export const finish = internalMutation({
  args: { deliveryId, attemptNumber: v.number(), outcome: sendOutcome }, returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.deliveryId);
    if (!row || row.attemptCount !== args.attemptNumber) return null;
    const { outcome } = args;
    // Late positive evidence can resolve expiry, but expiry never authorizes another send.
    const lateAcceptance = row.state === "unknown" && row.category === "claim_expired" && outcome.status === "provider_accepted";
    if (row.state !== "claimed" && !lateAcceptance) return null;
    const now = Date.now();
    if (row.state === "claimed" && row.claimExpiresAt !== undefined && row.claimExpiresAt <= now && outcome.status !== "provider_accepted") {
      await expire(ctx, row, now);
      return null;
    }
    const category = outcome.status === "provider_accepted" ? undefined : outcome.category;
    const rawId = outcome.status === "provider_accepted" ? outcome.providerMessageId : undefined;
    const providerMessageId = rawId && /^[\w-]{1,128}$/.test(rawId) ? rawId : undefined;
    const retryable = outcome.status === "failed" && ["rate_limited", "pre_send_unavailable"].includes(outcome.category);
    const nextAttemptAt = retryable && row.attemptCount < MAX_EMAIL_ATTEMPTS
      ? now + retryDelay(row.attemptCount, row._id) : undefined;
    const retryAt = nextAttemptAt !== undefined && nextAttemptAt < row.createdAt + EMAIL_RECOVERY_WINDOW_MS ? nextAttemptAt : undefined;
    const scheduledFunctionId = retryAt === undefined ? undefined : await ctx.scheduler.runAt(retryAt,
      internal.operationalEmailActions.dispatch, { deliveryId: row._id });
    await ctx.db.patch(row._id, { state: outcome.status, category, providerMessageId, updatedAt: now,
      claimExpiresAt: undefined, nextAttemptAt: retryAt, scheduledFunctionId,
      attempts: row.attempts.map(attempt => attempt.number === row.attemptCount
        ? { ...attempt, state: outcome.status, category, providerMessageId, finishedAt: now } : attempt) });
    return null;
  },
});

/** Bounded repair of missed callbacks. Claimed work becomes unknown, never pending. */
export const recover = internalMutation({
  args: {}, returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db.query("operationalEmailDeliveries").withIndex("by_state_claimExpiresAt",
      q => q.eq("state", "claimed").gt("claimExpiresAt", 0).lte("claimExpiresAt", now)).take(EMAIL_RECOVERY_BATCH);
    for (const row of expired) await expire(ctx, row, now);
    for (const state of ["pending", "failed"] as const) {
      const due = await ctx.db.query("operationalEmailDeliveries").withIndex("by_state_nextAttemptAt",
        q => q.eq("state", state).gt("nextAttemptAt", 0).lte("nextAttemptAt", now)).take(EMAIL_RECOVERY_BATCH);
      for (const row of due) {
        if (row.attemptCount >= MAX_EMAIL_ATTEMPTS || now - row.createdAt >= EMAIL_RECOVERY_WINDOW_MS) {
          await ctx.db.patch(row._id, { state: "skipped", category: "retry_window_expired", nextAttemptAt: undefined, updatedAt: now });
          continue;
        }
        const scheduled = row.scheduledFunctionId ? await ctx.db.system.get(row.scheduledFunctionId) : null;
        if (scheduled && ["pending", "inProgress"].includes(scheduled.state.kind)) continue;
        await ctx.db.patch(row._id, { scheduledFunctionId: await ctx.scheduler.runAfter(0,
          internal.operationalEmailActions.dispatch, { deliveryId: row._id }), updatedAt: now });
      }
    }
    return null;
  },
});

/** Owner-only metadata, with no recipient address, message body or provider error text. */
export const listForOwner = query({
  args: { userId: v.optional(v.id("users")), sessionToken: v.string(), paginationOpts: paginationOptsValidator },
  returns: v.object({ page: v.array(v.object({ id: deliveryId, jobId: v.id("jobs"), recipientId: v.id("users"),
    kind: v.union(v.literal("assignment"), v.literal("completion"), v.literal("approval")), eventKey: v.string(),
    state: deliveryState, attemptCount: v.number(), createdAt: v.number(), updatedAt: v.number(),
    nextAttemptAt: v.optional(v.number()), claimExpiresAt: v.optional(v.number()), category: v.optional(errorCategory),
    providerMessageId: v.optional(v.string()), attempts: v.array(attemptSummary) })), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    if (!Number.isInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 50) {
      throw new Error("Choose 1–50 delivery records per page");
    }
    const result = await ctx.db.query("operationalEmailDeliveries").withIndex("by_company_createdAt",
      q => q.eq("companyId", owner.companyId)).order("desc").paginate(args.paginationOpts);
    return { isDone: result.isDone, continueCursor: result.continueCursor, page: result.page.map(row => ({
      id: row._id, jobId: row.jobId, recipientId: row.recipientId, kind: row.event.kind, eventKey: row.eventKey,
      state: row.state, attemptCount: row.attemptCount, createdAt: row.createdAt, updatedAt: row.updatedAt,
      nextAttemptAt: row.nextAttemptAt, claimExpiresAt: row.claimExpiresAt, category: row.category,
      providerMessageId: row.providerMessageId, attempts: row.attempts,
    })) };
  },
});
