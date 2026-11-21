import { eligibleFounderStripeDetails } from "./founderLaunch";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export const subjects = {
  signup: "SCRUB — New Company Signup",
  access: "SCRUB — Subscription/Trial Started",
  paid: "SCRUB — First Paid Subscription",
  assessment: "SCRUB — Assessment Completed",
  giveaway: "SCRUB — Giveaway Entry",
} as const;
export type FounderKind = keyof typeof subjects;

/** Outbox creation shares the producer transaction; cron schedules after commit. */
export async function queueFounder(ctx: MutationCtx, key: string, kind: FounderKind, details: Record<string, string>) {
  const existing = await ctx.db.query("founderNotifications").withIndex("by_key", q => q.eq("key", key)).unique();
  // Discard unsent evidence from the earlier draft without reopening an ambiguous send.
  if (existing && (kind === "access" || kind === "paid") && ["pending", "skipped"].includes(existing.state) &&
      !eligibleFounderStripeDetails(kind, existing.details) && eligibleFounderStripeDetails(kind, details)) {
    await ctx.db.patch(existing._id, { details, state: "pending", createdAt: Date.now() });
    return;
  }
  if (!existing) await ctx.db.insert("founderNotifications", { key, kind, details, state: "pending", createdAt: Date.now() });
}

export async function reconcileFounderBilling(ctx: MutationCtx, companyId: Id<"companies">, verifiedPayment?: Record<string, string>) {
  const company = await ctx.db.get(companyId);
  if (!company?.stripeCustomerId || !company.stripeSubscriptionId) return;
  // Require a real owner; worker/client/affiliate accounts cannot qualify.
  const provisioning = await ctx.db.query("checkoutProvisioning").withIndex("by_stripeCustomerId", q => q.eq("stripeCustomerId", company.stripeCustomerId!)).first();
  if (provisioning && provisioning.companyId !== companyId) return;
  const fact = await ctx.db.query("founderBillingFacts").withIndex("by_customer_subscription", q => q.eq("customerId", company.stripeCustomerId!).eq("subscriptionId", company.stripeSubscriptionId!)).unique();
  const owner = await ctx.db.query("users").withIndex("by_companyId_role", q => q.eq("companyId", companyId).eq("role", "owner")).first();
  if (!owner || owner.status !== "active") return;
  const base = { Company: company.name, Name: owner?.name ?? "Unavailable", Email: owner?.email ?? "Unavailable", Plan: company.tier ?? company.stripePriceId ?? "Unavailable" };
  if (fact?.access && eligibleFounderStripeDetails("access", fact.access)) await queueFounder(ctx, `access:${companyId}:${company.stripeSubscriptionId}`, "access", { ...base, ...fact.access });
  const payment = verifiedPayment ?? fact?.payment;
  if (payment && eligibleFounderStripeDetails("paid", payment)) await queueFounder(ctx, `paid:${companyId}`, "paid", { ...base, ...payment });
}
