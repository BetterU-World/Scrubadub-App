import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { billingSnapshot, noticeRow } from "./lib/subscriptionNoticeModel";
import { DAY, noticeKey, noticePlans, snapshotKey } from "./lib/subscriptionPolicy";

const enabled = () => process.env.SCRUB_ENABLE_SUBSCRIPTION_NOTICES === "true" && process.env.SCRUB_SUBSCRIPTION_EMAIL_OWNER === "scrub";
const noticeId = v.id("subscriptionNotices");

export const context = internalQuery({
  args: { subscriptionId: v.string(), customerId: v.string() },
  returns: v.union(v.null(), v.object({ companyId: v.optional(v.id("companies")), hasConsent: v.boolean() })),
  handler: async (ctx, args) => {
    const company = await ctx.db.query("companies").withIndex("by_stripeCustomerId", q => q.eq("stripeCustomerId", args.customerId)).unique();
    if (company?.stripeSubscriptionId && company.stripeSubscriptionId !== args.subscriptionId) return null;
    const consent = await ctx.db.query("subscriptionCheckoutConsents").withIndex("by_subscription", q => q.eq("stripeSubscriptionId", args.subscriptionId)).first();
    if (!company && consent?.stripeCustomerId !== args.customerId) return null;
    return { companyId: company?._id, hasConsent: !!consent };
  },
});

export const reconcile = internalMutation({
  args: { snapshot: billingSnapshot, confirmation: v.boolean() }, returns: v.null(),
  handler: async (ctx, { snapshot, confirmation }) => {
    if (!enabled()) return null;
    const company = await ctx.db.query("companies").withIndex("by_stripeCustomerId", q => q.eq("stripeCustomerId", snapshot.customerId)).unique();
    if (company?.stripeSubscriptionId && company.stripeSubscriptionId !== snapshot.subscriptionId) return null;
    const consent = await ctx.db.query("subscriptionCheckoutConsents").withIndex("by_subscription", q => q.eq("stripeSubscriptionId", snapshot.subscriptionId)).first();
    if (!company && consent?.stripeCustomerId !== snapshot.customerId) return null;
    const now = Date.now(); const fingerprint = snapshotKey(snapshot);
    let account = await ctx.db.query("subscriptionNoticeAccounts").withIndex("by_subscription", q => q.eq("snapshot.subscriptionId", snapshot.subscriptionId)).unique();
    if (!account) {
      const id = await ctx.db.insert("subscriptionNoticeAccounts", { companyId: company?._id, snapshot, fingerprint, updatedAt: now });
      account = (await ctx.db.get(id))!;
    } else {
      if (account.snapshot.customerId !== snapshot.customerId) throw new Error("Subscription customer mismatch");
      await ctx.db.patch(account._id, { companyId: company?._id, snapshot, fingerprint, updatedAt: now });
    }
    const plans = noticePlans(snapshot, now);
    if (confirmation && consent) plans.push({ kind: "confirmation", targetAt: 0, dueAt: now, expiresAt: now + DAY });
    const wanted = new Set(plans.map(p => noticeKey(snapshot.subscriptionId, p.kind, p.targetAt)));
    // An account has at most the confirmation, annual notice and its bounded Stripe discount list.
    const old = await ctx.db.query("subscriptionNotices").withIndex("by_account", q => q.eq("accountId", account!._id)).order("desc").take(100);
    for (const row of old) if (["pending", "failed"].includes(row.status) && !wanted.has(row.eventKey) && row.kind !== "confirmation") {
      await ctx.db.patch(row._id, { status: "superseded", updatedAt: now });
    }
    for (const plan of plans) {
      const eventKey = noticeKey(snapshot.subscriptionId, plan.kind, plan.targetAt);
      const existing = await ctx.db.query("subscriptionNotices").withIndex("by_key", q => q.eq("eventKey", eventKey)).unique();
      if (!existing) await ctx.db.insert("subscriptionNotices", { accountId: account._id, eventKey, ...plan,
        fingerprint, attempts: 0, status: now >= plan.expiresAt ? "missed" : "pending", updatedAt: now });
      else if (existing.status === "pending" && existing.attempts === 0) await ctx.db.patch(existing._id, { fingerprint, updatedAt: now });
    }
    return null;
  },
});

export const claim = internalMutation({
  args: { noticeId },
  returns: v.union(v.null(), v.object({ ...noticeRow.fields, snapshot: billingSnapshot })),
  handler: async (ctx, args) => {
    if (!enabled()) return null;
    const row = await ctx.db.get(args.noticeId); const now = Date.now();
    if (!row || !["pending", "failed"].includes(row.status) || row.dueAt > now) return null;
    const account = await ctx.db.get(row.accountId);
    if (!account || (row.kind !== "confirmation" && !account.snapshot.renewing) || row.fingerprint !== account.fingerprint) {
      await ctx.db.patch(row._id, { status: "superseded", updatedAt: now }); return null;
    }
    if (now >= row.expiresAt || row.attempts >= 5 || (row.firstAttemptAt !== undefined && now - row.firstAttemptAt >= 23 * 3600000)) {
      await ctx.db.patch(row._id, { status: row.attempts > 0 ? "unknown" : "missed", updatedAt: now }); return null;
    }
    await ctx.db.patch(row._id, { status: "claimed", attempts: row.attempts + 1,
      firstAttemptAt: row.firstAttemptAt ?? now, leaseUntil: now + 10 * 60000, updatedAt: now });
    return { ...row, attempts: row.attempts + 1, snapshot: account.snapshot };
  },
});

export const finish = internalMutation({
  args: { noticeId, attempt: v.number(), result: v.union(v.literal("accepted"), v.literal("retry"), v.literal("unknown"), v.literal("superseded")), providerId: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.noticeId);
    if (!row || row.attempts !== args.attempt || (row.status !== "claimed" &&
        !(args.result === "accepted" && ["failed", "unknown"].includes(row.status)))) return null;
    const now = Date.now();
    await ctx.db.patch(row._id, { status: args.result === "retry" ? "failed" : args.result,
      dueAt: args.result === "retry" ? now + [60000, 300000, 900000, 3600000][Math.min(row.attempts - 1, 3)] : row.dueAt,
      providerId: args.providerId, leaseUntil: undefined, updatedAt: now });
    return null;
  },
});

export const tick = internalMutation({
  args: {}, returns: v.null(),
  handler: async (ctx) => {
    if (!enabled()) return null;
    const now = Date.now();
    const expired = await ctx.db.query("subscriptionNotices").withIndex("by_status_lease", q => q.eq("status", "claimed").lt("leaseUntil", now)).take(50);
    for (const row of expired) {
      // Reuse the same provider idempotency key inside its 24-hour window; never blindly retry later.
      await ctx.db.patch(row._id, { status: row.firstAttemptAt && now - row.firstAttemptAt < 23 * 3600000 ? "failed" : "unknown", dueAt: now, leaseUntil: undefined, updatedAt: now });
    }
    let stagger = 0;
    for (const status of ["pending", "failed"] as const) {
      const rows = await ctx.db.query("subscriptionNotices").withIndex("by_status_due", q => q.eq("status", status).lte("dueAt", now)).take(50);
      for (const row of rows) await ctx.scheduler.runAfter(stagger++ * 600, internal.actions.subscriptionNotices.dispatch, { noticeId: row._id });
    }
    return null;
  },
});

export const candidates = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({ page: v.array(v.object({ stripeCustomerId: v.optional(v.string()), stripeSubscriptionId: v.optional(v.string()) })), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("companies").paginate({ cursor: args.cursor, numItems: 50 });
    return { isDone: page.isDone, continueCursor: page.continueCursor, page: page.page.map(company => ({ stripeCustomerId: company.stripeCustomerId, stripeSubscriptionId: company.stripeSubscriptionId })) };
  },
});

export const get = internalQuery({
  args: { noticeId },
  returns: v.union(v.null(), v.object({ notice: noticeRow, snapshot: billingSnapshot })),
  handler: async (ctx, args) => {
    const notice = await ctx.db.get(args.noticeId);
    const account = notice ? await ctx.db.get(notice.accountId) : null;
    return notice && account ? { notice, snapshot: account.snapshot } : null;
  },
});

export const suppress = internalMutation({
  args: { noticeId }, returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.noticeId);
    if (row && ["pending", "failed"].includes(row.status)) await ctx.db.patch(row._id, { status: "superseded", updatedAt: Date.now() });
    return null;
  },
});
