"use node";
import { action, ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { requireOwnerSession } from "../lib/sessions";
import { requireAppUrl, stripeExpectedLivemode } from "../lib/environment";
import { getCompanyMerchantClient, merchantAccountParameters, retrieveCompanyMerchantReadiness } from "../lib/companyStripeMerchant";
import { getStripeClientOrNull } from "../lib/stripe";
import { expireCheckoutSessionForAttempt, retrieveCheckoutSessionForAttempt } from "../lib/invoiceStripeContext";

async function ensureConnectAccount(ctx: ActionCtx, userId: Id<"users">) {
  const data = await ctx.runQuery(internal.queries.companyStripeConnect.getOwnerAndCompany, { userId });
  if (!data) throw new Error("Owner or company not found");
  const stripe = getCompanyMerchantClient();
  if (data.stripeConnectArchitecture === "merchant_direct_v2" && data.stripeConnectAccountId) return { stripe, accountId: data.stripeConnectAccountId };
  const flow = await ctx.runMutation(internal.mutations.companyStripeConnect.reserveCompanyConnectFlow, { companyId: data.companyId, ownerId: userId });
  if (flow.accountId) return { stripe, accountId: flow.accountId };
  // Do not retry an uncertain creation beyond Stripe's idempotency retention window.
  if (Date.now() - flow.createdAt > 23 * 60 * 60 * 1000) throw new Error("Stripe setup requires support review before retrying");
  const account = await stripe.v2.core.accounts.create(merchantAccountParameters(data.email, String(data.companyId), String(flow._id)), { idempotencyKey: `company-merchant-flow:${flow._id}` });
  await ctx.runMutation(internal.mutations.companyStripeConnect.recordCompanyConnectPending, { flowId: flow._id, accountId: account.id });
  return { stripe, accountId: account.id };
}

export const ensureCompanyStripeConnectAccount = action({
  args: { userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args): Promise<string> => {
    const principal = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    return (await ensureConnectAccount(ctx, principal.userId)).accountId;
  },
});

export const createCompanyStripeAccountLink = action({
  args: { userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args): Promise<{ url: string }> => {
    const principal = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    const { stripe, accountId } = await ensureConnectAccount(ctx, principal.userId);
    const appUrl = requireAppUrl();
    const link = await stripe.v2.core.accountLinks.create({ account: accountId, use_case: { type: "account_onboarding", account_onboarding: { configurations: ["merchant"], refresh_url: `${appUrl}/owner/settings/billing?stripe=refresh`, return_url: `${appUrl}/owner/settings/billing?stripe=return` } } });
    return { url: link.url };
  },
});

export const refreshCompanyStripeConnectStatus = action({
  args: { userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args): Promise<{ refreshed: boolean }> => {
    const principal = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    const data = await ctx.runQuery(internal.queries.companyStripeConnect.getOwnerAndCompany, { userId: principal.userId });
    if (!data) throw new Error("Owner or company not found");
    const id = data.pendingAccountId ?? data.stripeConnectAccountId;
    if (!id || (!data.pendingAccountId && data.stripeConnectArchitecture !== "merchant_direct_v2")) return { refreshed: false };
    let readiness = await retrieveCompanyMerchantReadiness(id);
    if (data.pendingAccountId && data.flowId && readiness.ready) {
      if (readiness.account.metadata?.convexCompanyId !== String(data.companyId) || readiness.account.metadata?.scrubOnboardingFlowId !== String(data.flowId)) throw new Error("Stripe onboarding identity mismatch");
      const attempts = await ctx.runQuery(internal.invoicePaymentInternal.getOpenForCompany, { companyId: data.companyId });
      const payments = getStripeClientOrNull();
      for (const attempt of attempts) {
        if (!attempt.stripeCheckoutSessionId) throw new Error("Previous Checkout creation requires reconciliation before reconnecting");
        // A completed or uncertain Session blocks replacement; its signed webhook resolves it.
        const session = await retrieveCheckoutSessionForAttempt(payments, attempt, attempt.stripeCheckoutSessionId);
        if (session.status === "open") await expireCheckoutSessionForAttempt(payments, attempt, attempt.stripeCheckoutSessionId);
        else if (session.status !== "expired") throw new Error("Previous payment is awaiting confirmation before reconnecting");
        await ctx.runMutation(internal.invoicePaymentInternal.markUnavailable, { attemptId: attempt._id, status: "expired" });
      }
      readiness = await retrieveCompanyMerchantReadiness(id);
      if (!readiness.ready) throw new Error("Stripe is still verifying this account");
      await ctx.runMutation(internal.mutations.companyStripeConnect.activateCompanyMerchant, { companyId: data.companyId, ownerId: principal.userId, flowId: data.flowId, accountId: id, observedAt: Date.now() });
    } else if (!data.pendingAccountId) {
      await ctx.runMutation(internal.mutations.companyStripeConnect.syncCompanyStripeConnectStatus, { stripeConnectAccountId: id, observedAt: Date.now(), ...readiness.snapshot });
    }
    return { refreshed: true };
  },
});

/** Owner diagnostic is restricted to test keys and uses the direct-charge rail. */
export const createCompanyStripeTestCheckout = action({
  args: { userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args): Promise<{ url: string | null }> => {
    const principal = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    if (stripeExpectedLivemode()) throw new Error("Test Checkout requires Stripe test mode");
    const data = await ctx.runQuery(internal.queries.companyStripeConnect.getOwnerAndCompany, { userId: principal.userId });
    if (!data?.stripeConnectAccountId || data.stripeConnectArchitecture !== "merchant_direct_v2" || !(await retrieveCompanyMerchantReadiness(data.stripeConnectAccountId)).ready) throw new Error("Finish connecting Stripe first");
    const appUrl = requireAppUrl();
    const session = await getStripeClientOrNull().checkout.sessions.create({ mode: "payment", payment_method_types: ["card"], line_items: [{ price_data: { currency: "usd", product_data: { name: "Test payment" }, unit_amount: 100 }, quantity: 1 }], success_url: `${appUrl}/owner/settings/billing?checkout=success`, cancel_url: `${appUrl}/owner/settings/billing?checkout=cancel` }, { stripeAccount: data.stripeConnectAccountId });
    return { url: session.url };
  },
});
