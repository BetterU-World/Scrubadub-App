import { eligibleFounderStripeDetails, founderStripeLaunchSeconds } from "./lib/founderLaunch";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { reconcileFounderBilling } from "./lib/founderNotifications";

export const billing = internalMutation({
  args: { customerId: v.string(), subscriptionId: v.string(), access: v.optional(v.record(v.string(), v.string())), payment: v.optional(v.record(v.string(), v.string())) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = args.access && eligibleFounderStripeDetails("access", args.access) ? args.access : undefined;
    const payment = args.payment && eligibleFounderStripeDetails("paid", args.payment) ? args.payment : undefined;
    if (!access && !payment) return null;
    const fact = await ctx.db.query("founderBillingFacts").withIndex("by_customer_subscription", q => q.eq("customerId", args.customerId).eq("subscriptionId", args.subscriptionId)).unique();
    if (!fact) await ctx.db.insert("founderBillingFacts", { customerId: args.customerId, subscriptionId: args.subscriptionId, access, payment });
    else await ctx.db.patch(fact._id, { access: fact.access && eligibleFounderStripeDetails("access", fact.access) ? fact.access : access, payment: fact.payment && eligibleFounderStripeDetails("paid", fact.payment) ? fact.payment : payment });
    const company = await ctx.db.query("companies").withIndex("by_stripeCustomerId", q => q.eq("stripeCustomerId", args.customerId)).first();
    if (company) await reconcileFounderBilling(ctx, company._id, payment);
    return null;
  },
});

export const tick = internalMutation({
  args: {}, returns: v.null(),
  handler: async ctx => {
    const checks = await ctx.db.query("founderPaymentChecks").withIndex("by_state_due", q => q.eq("state", "pending").lte("dueAt", Date.now())).take(10);
    for (const check of checks) await ctx.scheduler.runAfter(0, internal.founderNotificationActions.checkPayment, { id: check._id });
    const stale = await ctx.db.query("founderNotifications").withIndex("by_state", q => q.eq("state", "sending")).take(25);
    for (const row of stale) if ((row.claimedAt ?? 0) < Date.now() - 10 * 60_000) await ctx.db.patch(row._id, { state: "unknown" });
    const rows = await ctx.db.query("founderNotifications").withIndex("by_state", q => q.eq("state", "pending")).take(25);
    for (const row of rows) await ctx.scheduler.runAfter(0, internal.founderNotificationActions.dispatch, { id: row._id });
    return null;
  },
});
export const claim = internalMutation({
  args: { id: v.id("founderNotifications") },
  returns: v.union(v.null(), v.object({ kind: v.string(), details: v.record(v.string(), v.string()) })),
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (row?.state !== "pending") return null;
    if (!eligibleFounderStripeDetails(row.kind, row.details)) {
      await ctx.db.patch(id, { state: "skipped" });
      return null;
    }
    await ctx.db.patch(id, { state: "sending", claimedAt: Date.now() });
    return { kind: row.kind, details: row.details };
  },
});
export const finish = internalMutation({
  args: { id: v.id("founderNotifications"), state: v.union(v.literal("accepted"), v.literal("failed"), v.literal("unknown"), v.literal("skipped")), providerMessageId: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { id, ...result }) => {
    const row = await ctx.db.get(id);
    if (row?.state === "sending") await ctx.db.patch(id, result);
    return null;
  },
});

export const recordPaymentCheck = internalMutation({
  args: { customerId: v.string(), subscriptionId: v.string(), invoiceId: v.string(), eventId: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    if (founderStripeLaunchSeconds() === null) {
      console.warn("[FOUNDER-NOTIFICATIONS] Set SCRUB_FOUNDER_STRIPE_LAUNCH_AT to a fixed UTC launch instant; Stripe notifications disabled.");
      return null;
    }
    const existing = await ctx.db.query("founderPaymentChecks").withIndex("by_invoice", q => q.eq("invoiceId", args.invoiceId)).unique();
    if (!existing) await ctx.db.insert("founderPaymentChecks", { ...args, attempts: 0, dueAt: Date.now(), state: "pending" });
    return null;
  },
});
export const claimPaymentCheck = internalMutation({
  args: { id: v.id("founderPaymentChecks") },
  returns: v.union(v.null(), v.object({ customerId: v.string(), subscriptionId: v.string(), invoiceId: v.string(), eventId: v.string() })),
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (!row || row.state !== "pending" || row.dueAt > Date.now()) return null;
    if (row.attempts >= 4) { await ctx.db.patch(id, { state: "failed" }); return null; }
    await ctx.db.patch(id, { attempts: row.attempts + 1, dueAt: Date.now() + 15 * 60_000 });
    return { customerId: row.customerId, subscriptionId: row.subscriptionId, invoiceId: row.invoiceId, eventId: row.eventId };
  },
});
export const finishPaymentCheck = internalMutation({
  args: { id: v.id("founderPaymentChecks") }, returns: v.null(),
  handler: async (ctx, { id }) => { await ctx.db.patch(id, { state: "done" }); return null; },
});

export const paymentAlreadyRecorded = internalQuery({
  args: { customerId: v.string() }, returns: v.boolean(),
  handler: async (ctx, { customerId }) => {
    const company = await ctx.db.query("companies").withIndex("by_stripeCustomerId", q => q.eq("stripeCustomerId", customerId)).first();
    if (!company) return false;
    const row = await ctx.db.query("founderNotifications").withIndex("by_key", q => q.eq("key", `paid:${company._id}`)).unique();
    return !!row && (eligibleFounderStripeDetails("paid", row.details) || ["sending", "accepted", "unknown"].includes(row.state));
  },
});
