import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id, Doc } from "./_generated/dataModel";
import { requireSuperadminSession } from "./lib/sessionAuth";
import { normalizeGiveawayEmail, giveawayCampaigns } from "./lib/giveawayCampaigns";
import { CAMPAIGN, CONTENT_VERSION, configuration, configDigest, digest, emailIdentity, category, preview, approvalPhrase, assertSendMode } from "./lib/giveawayCampaignEmail";
import { countsV, templateV, runStateV, rowStateV } from "./lib/giveawayEmailSchema";

const auth = { userId: v.id("users"), sessionToken: v.string() };
const runArg = { ...auth, runId: v.id("giveawayEmailRuns") };
const emptyCounts = () => ({ total: 0, winner: 0, marketing: 0, invalid: 0, duplicate: 0, noConsent: 0, invalidConsent: 0, suppressed: 0 });
async function getRun(ctx: MutationCtx, id: Id<"giveawayEmailRuns">) {
  const run = await ctx.db.get(id);
  if (!run) throw new Error("Campaign run not found");
  if (run.contentVersion !== CONTENT_VERSION || run.configHash !== await configDigest(configuration())) throw new Error("Campaign configuration/content changed; prepare a new run");
  return run;
}
async function isSuppressed(ctx: MutationCtx, emailHash: string) {
  return !!await ctx.db.query("marketingSuppressions").withIndex("by_emailHash", q => q.eq("emailHash", emailHash)).unique();
}
async function classify(ctx: MutationCtx, e: Doc<"giveawayEntries">, winner: string, emailHash: string) {
  const duplicates = await ctx.db.query("giveawayEntries").withIndex("by_campaign_email", q => q.eq("campaignId", CAMPAIGN).eq("normalizedEmail", e.normalizedEmail)).take(2);
  return category(e, winner, duplicates.length, await isSuppressed(ctx, emailHash));
}
export const designPreview = query({
  args: { ...auth, template: templateV }, returns: v.object({ subject: v.string(), preheader: v.string(), html: v.string(), text: v.string() }),
  handler: async (ctx, args) => { await requireSuperadminSession(ctx, args.sessionToken, args.userId); return preview(args.template); },
});
export const prepare = mutation({
  args: auth, returns: v.id("giveawayEmailRuns"),
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.sessionToken, args.userId);
    if (Date.now() < giveawayCampaigns[CAMPAIGN].endsAt) throw new Error("Campaign is still open");
    const configHash = await configDigest(configuration());
    return ctx.db.insert("giveawayEmailRuns", { mode: "production", state: "preparing", createdBy: args.userId, createdAt: Date.now(), configHash, contentVersion: CONTENT_VERSION, digest: await digest(`${CAMPAIGN}:${CONTENT_VERSION}:${configHash}`), cursor: null, counts: emptyCounts() });
  },
});
// Call manually until ready. Each transaction handles at most 100 entries and carries its own cursor.
export const prepareNextPage = mutation({
  args: runArg, returns: v.object({ done: v.boolean(), counts: countsV, digest: v.string() }),
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.sessionToken, args.userId);
    const run = await getRun(ctx, args.runId);
    if (run.state !== "preparing" || run.mode !== "production") throw new Error("Run is not preparing");
    const c = configuration();
    const page = await ctx.db.query("giveawayEntries").withIndex("by_campaign_email", q => q.eq("campaignId", CAMPAIGN)).paginate({ cursor: run.cursor, numItems: 100 });
    const counts = { ...run.counts }; let fingerprint = run.digest;
    for (const e of page.page) {
      const emailHash = await emailIdentity(e.normalizedEmail);
      const group = await classify(ctx, e, c.winner, emailHash);
      counts.total++; counts[group]++;
      fingerprint = await digest(`${fingerprint}:${e._id}:${emailHash}:${group}`);
      if (group === "winner" || group === "marketing") await ctx.db.insert("giveawayEmailRecipients", { runId: run._id, entryId: e._id, template: group, email: e.normalizedEmail, emailHash, state: "ready" });
    }
    await ctx.db.patch(run._id, { cursor: page.continueCursor, counts, digest: fingerprint, state: page.isDone ? "ready" : "preparing" });
    return { done: page.isDone, counts, digest: fingerprint };
  },
});
export const prepareTest = mutation({
  args: { ...auth, testEmail: v.string() }, returns: v.id("giveawayEmailRuns"),
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.sessionToken, args.userId);
    const c = configuration(); const email = normalizeGiveawayEmail(args.testEmail);
    if (!c.testRecipients.includes(email) || email === c.winner) throw new Error("Test address is not approved");
    // No participant address may be used as a test recipient, even if accidentally allowlisted.
    if ((await ctx.db.query("giveawayEntries").withIndex("by_campaign_email", q => q.eq("campaignId", CAMPAIGN).eq("normalizedEmail", email)).take(1)).length) throw new Error("Participant test recipients are prohibited");
    const emailHash = await emailIdentity(email); const configHash = await configDigest(c);
    const runId = await ctx.db.insert("giveawayEmailRuns", { mode: "test", state: "ready", createdBy: args.userId, createdAt: Date.now(), configHash, contentVersion: CONTENT_VERSION, digest: await digest(`test:${emailHash}:${configHash}:${CONTENT_VERSION}`), cursor: null, counts: { ...emptyCounts(), total: 2, winner: 1, marketing: 1 } });
    for (const template of ["winner", "marketing"] as const) await ctx.db.insert("giveawayEmailRecipients", { runId, template, email, emailHash, state: "ready" });
    return runId;
  },
});
export const status = query({
  args: runArg, returns: v.object({ state: runStateV, counts: countsV, digest: v.string(), mode: v.union(v.literal("test"), v.literal("production")), inFlight: v.boolean(), approvedAt: v.union(v.number(), v.null()), approvalExpiresAt: v.union(v.number(), v.null()) }),
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.sessionToken, args.userId); const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("Campaign run not found");
    return { state: run.state, counts: run.counts, digest: run.digest, mode: run.mode, inFlight: !!run.inFlight, approvedAt: run.approvedAt ?? null, approvalExpiresAt: run.approvalExpiresAt ?? null };
  },
});
export const approve = mutation({
  args: { ...runArg, expectedDigest: v.string(), approval: v.string(), confirmReadiness: v.boolean() }, returns: v.null(),
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.sessionToken, args.userId); const run = await getRun(ctx, args.runId);
    assertSendMode(run.mode);
    if (run.state !== "ready" || run.counts.winner !== 1 || run.digest !== args.expectedDigest || args.approval !== approvalPhrase(run.mode) || !args.confirmReadiness || Date.now() - run.createdAt > 24 * 60 * 60 * 1000) throw new Error("Explicit current campaign approval required");
    // Readiness attests to recipient eligibility/suppression audit, monitored sender/reply-to,
    // actual footer/opt-out, winner bonus activation terms and binding correspondence review.
    await ctx.db.patch(run._id, { state: "approved", approvedBy: args.userId, approvedAt: Date.now(), approvalExpiresAt: Date.now() + 60 * 60 * 1000 });
    return null;
  },
});
export const pause = mutation({ args: runArg, returns: v.null(), handler: async (ctx, args) => {
  await requireSuperadminSession(ctx, args.sessionToken, args.userId); const run = await ctx.db.get(args.runId);
  if (!run) throw new Error("Campaign run not found");
  if (run.state !== "approved" && run.state !== "paused") throw new Error("Only an approved delivery can be paused");
  await ctx.db.patch(run._id, { state: "paused" }); return null;
} });
export const ledgerPage = query({
  args: { ...runArg, paginationOpts: paginationOptsValidator },
  returns: v.object({ page: v.array(v.object({ recipientId: v.id("giveawayEmailRecipients"), template: templateV, state: rowStateV, providerId: v.union(v.string(), v.null()), acceptedAt: v.union(v.number(), v.null()), responseDeadline: v.union(v.number(), v.null()) })), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.sessionToken, args.userId);
    const page = await ctx.db.query("giveawayEmailRecipients").withIndex("by_runId_and_template_and_state", q => q.eq("runId", args.runId)).paginate({ ...args.paginationOpts, numItems: Math.max(1, Math.min(100, args.paginationOpts.numItems)) });
    return { ...page, page: page.page.map(row => ({ recipientId: row._id, template: row.template, state: row.state, providerId: row.providerId ?? null, acceptedAt: row.acceptedAt ?? null, responseDeadline: row.responseDeadline ?? null })) };
  },
});
export const reviewPausedRun = mutation({
  args: runArg, returns: v.null(), handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.sessionToken, args.userId); const run = await getRun(ctx, args.runId);
    if (run.state !== "paused" || run.inFlight) throw new Error("Outstanding delivery requires reconciliation");
    for (const template of ["winner", "marketing"] as const) for (const state of ["reserved", "rejected", "uncertain"] as const) {
      if (await ctx.db.query("giveawayEmailRecipients").withIndex("by_runId_and_template_and_state", q => q.eq("runId", run._id).eq("template", template).eq("state", state)).first()) throw new Error("Outstanding delivery requires reconciliation");
    }
    await ctx.db.patch(run._id, { state: "ready", approvedAt: undefined, approvalExpiresAt: undefined }); return null;
  },
});

// Called immediately before each provider attempt. A durable reservation cannot be replayed.
export const reserve = internalMutation({
  args: runArg, returns: v.union(v.null(), v.object({ recipientId: v.id("giveawayEmailRecipients"), email: v.string(), emailHash: v.string(), template: templateV, key: v.string() })),
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.sessionToken, args.userId); const run = await getRun(ctx, args.runId); assertSendMode(run.mode);
    if (run.state !== "approved" || !run.approvalExpiresAt || run.approvalExpiresAt <= Date.now() || run.inFlight) throw new Error("Run is not approved, approval expired, or a send is unresolved");
    let row = await ctx.db.query("giveawayEmailRecipients").withIndex("by_runId_and_template_and_state", q => q.eq("runId", run._id).eq("template", "winner").eq("state", "ready")).first();
    if (!row) {
      const winner = await ctx.db.query("giveawayEmailRecipients").withIndex("by_runId_and_template_and_state", q => q.eq("runId", run._id).eq("template", "winner").eq("state", "accepted")).first();
      if (!winner) throw new Error("Winner must have known provider acceptance before marketing");
      row = await ctx.db.query("giveawayEmailRecipients").withIndex("by_runId_and_template_and_state", q => q.eq("runId", run._id).eq("template", "marketing").eq("state", "ready")).first();
    }
    if (!row) { await ctx.db.patch(run._id, { state: "complete" }); return null; }
    const c = configuration();
    if (run.mode === "test") {
      if (!c.testRecipients.includes(row.email) || row.email === c.winner || (await ctx.db.query("giveawayEntries").withIndex("by_campaign_email", q => q.eq("campaignId", CAMPAIGN).eq("normalizedEmail", row!.email)).take(1)).length) throw new Error("Test recipient is no longer approved");
    } else {
      const entry = row.entryId ? await ctx.db.get(row.entryId) : null;
      const group = entry ? await classify(ctx, entry, c.winner, row.emailHash) : "invalid";
      if (!entry || entry.normalizedEmail !== row.email || group !== row.template) {
        await ctx.db.patch(row._id, { state: "suppressed" });
        if (row.template === "winner") await ctx.db.patch(run._id, { state: "paused" });
        return null;
      }
    }
    // Suppression may change since snapshot/approval; recheck in this reservation transaction.
    if (row.template === "marketing" && await isSuppressed(ctx, row.emailHash)) { await ctx.db.patch(row._id, { state: "suppressed" }); return null; }
    const key = `${CAMPAIGN}:${run.mode}:${run.mode === "test" ? run._id + ":" : ""}${row.template}:${row.emailHash}`;
    const existing = await ctx.db.query("giveawayEmailDeliveries").withIndex("by_key", q => q.eq("key", key)).unique();
    if (existing) {
      // A new snapshot/content version cannot bypass the campaign-level send ledger.
      if (existing.state === "accepted") {
        await ctx.db.patch(row._id, { state: "accepted", providerId: existing.providerId, acceptedAt: existing.acceptedAt, ...(row.template === "winner" && run.mode === "production" && existing.acceptedAt ? { responseDeadline: existing.acceptedAt + 72 * 60 * 60 * 1000 } : {}) });
      } else await ctx.db.patch(run._id, { state: "paused" });
      return null;
    }
    const now = Date.now();
    await ctx.db.insert("giveawayEmailDeliveries", { key, recipientId: row._id, state: "reserved", reservedAt: now });
    await ctx.db.patch(row._id, { state: "reserved", reservedAt: now });
    await ctx.db.patch(run._id, { inFlight: row._id });
    return { recipientId: row._id, email: row.email, emailHash: row.emailHash, template: row.template, key };
  },
});
export const finish = internalMutation({
  args: { recipientId: v.id("giveawayEmailRecipients"), key: v.string(), outcome: v.union(v.literal("accepted"), v.literal("rejected"), v.literal("uncertain")), providerId: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.recipientId); const delivery = await ctx.db.query("giveawayEmailDeliveries").withIndex("by_key", q => q.eq("key", args.key)).unique();
    if (!row || !delivery || delivery.recipientId !== row._id || delivery.state !== "reserved" || row.state !== "reserved") throw new Error("Invalid delivery reservation");
    if (args.outcome === "accepted" && !args.providerId) throw new Error("Provider acceptance requires message ID");
    const run = await ctx.db.get(row.runId); if (!run) throw new Error("Run not found");
    const acceptedAt = args.outcome === "accepted" ? Date.now() : undefined;
    await ctx.db.patch(delivery._id, { state: args.outcome, providerId: args.providerId, acceptedAt });
    await ctx.db.patch(row._id, { state: args.outcome, providerId: args.providerId, acceptedAt, ...(acceptedAt && row.template === "winner" && run.mode === "production" ? { responseDeadline: acceptedAt + 72 * 60 * 60 * 1000 } : {}) });
    await ctx.db.patch(run._id, { inFlight: undefined, state: args.outcome === "accepted" && run.state === "approved" ? "approved" : "paused" });
    return null;
  },
});
// No blind retry. Operator must reconcile acceptance with the provider before resuming.
export const reconcileAccepted = mutation({
  args: { ...runArg, recipientId: v.id("giveawayEmailRecipients"), providerId: v.string(), acceptedAt: v.number(), evidenceReference: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.sessionToken, args.userId);
    // Reconcile historical provider acceptance even after key/config/content changes.
    // Any subsequent approval still requires a current configuration-matching run.
    const run = await ctx.db.get(args.runId); const row = await ctx.db.get(args.recipientId);
    if (!run || !row || row.runId !== run._id || (run.inFlight && run.inFlight !== row._id) || !["reserved", "uncertain"].includes(row.state) || !/^[-a-zA-Z0-9_]{5,100}$/.test(args.providerId) || args.evidenceReference.length < 8 || args.evidenceReference.length > 200 || !row.reservedAt || !Number.isFinite(args.acceptedAt) || args.acceptedAt < row.reservedAt || args.acceptedAt > Date.now()) throw new Error("Verified provider acceptance evidence required");
    const key = `${CAMPAIGN}:${run.mode}:${run.mode === "test" ? run._id + ":" : ""}${row.template}:${row.emailHash}`;
    const delivery = await ctx.db.query("giveawayEmailDeliveries").withIndex("by_key", q => q.eq("key", key)).unique();
    if (!delivery || delivery.recipientId !== row._id || !["reserved", "uncertain"].includes(delivery.state)) throw new Error("Delivery not found or already resolved");
    await ctx.db.patch(delivery._id, { state: "accepted", providerId: args.providerId, acceptedAt: args.acceptedAt, reconciledBy: args.userId, evidenceReference: args.evidenceReference });
    await ctx.db.patch(row._id, { state: "accepted", providerId: args.providerId, acceptedAt: args.acceptedAt, ...(row.template === "winner" && run.mode === "production" ? { responseDeadline: args.acceptedAt + 72 * 60 * 60 * 1000 } : {}) });
    // Reconciliation never authorizes more sends: explicit approval is required again.
    await ctx.db.patch(run._id, { inFlight: undefined, state: "ready", approvedAt: undefined, approvalExpiresAt: undefined }); return null;
  },
});
export const suppress = mutation({
  args: { ...auth, email: v.string(), reason: v.union(v.literal("provider"), v.literal("manual")) }, returns: v.null(),
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.sessionToken, args.userId);
    const emailHash = await emailIdentity(normalizeGiveawayEmail(args.email));
    if (!await isSuppressed(ctx, emailHash)) await ctx.db.insert("marketingSuppressions", { emailHash, reason: args.reason, createdAt: Date.now(), createdBy: args.userId }); return null;
  },
});
export const unsubscribe = internalMutation({
  args: { emailHash: v.string() }, returns: v.null(), handler: async (ctx, args) => {
    if (!/^[a-f0-9]{64}$/.test(args.emailHash)) throw new Error("Invalid suppression key");
    if (!await isSuppressed(ctx, args.emailHash)) await ctx.db.insert("marketingSuppressions", { emailHash: args.emailHash, reason: "unsubscribe", createdAt: Date.now() }); return null;
  },
});
export const providerOptOut = internalMutation({
  args: { emailHash: v.string() }, returns: v.null(), handler: async (ctx, args) => {
    if (!/^[a-f0-9]{64}$/.test(args.emailHash)) throw new Error("Invalid suppression key");
    if (!await isSuppressed(ctx, args.emailHash)) await ctx.db.insert("marketingSuppressions", { emailHash: args.emailHash, reason: "provider", createdAt: Date.now() }); return null;
  },
});
