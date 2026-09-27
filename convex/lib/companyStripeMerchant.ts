import StripePreview from "stripe-connect-preview";
import { assertExternalSideEffectsAllowed, requireStripeSecretKey, stripeExpectedLivemode } from "./environment";
import { liveMerchantInvoiceCheckoutReady, snapshotFromStripeAccount } from "./companyConnectReadiness";

export const CONNECT_API_VERSION = "2026-08-26.preview";
export const MERCHANT_INCLUDES: StripePreview.V2.Core.AccountRetrieveParams.Include[] = ["configuration.merchant", "defaults", "requirements", "identity"];
export function getCompanyMerchantClient() {
  assertExternalSideEffectsAllowed("Stripe");
  return new StripePreview(requireStripeSecretKey(), { apiVersion: CONNECT_API_VERSION });
}
export function merchantAccountParameters(email: string, companyId: string, flowId: string): StripePreview.V2.Core.AccountCreateParams {
  return {
    contact_email: email, dashboard: "express", identity: { country: "us" },
    // Payout status is returned under stripe_balance.payouts, but this SDK/API
    // does not expose a separately requestable Merchant payout capability.
    configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
    defaults: { currency: "usd", responsibilities: { fees_collector: "stripe", losses_collector: "stripe" } },
    metadata: { convexCompanyId: companyId, scrubOnboardingFlowId: flowId }, include: MERCHANT_INCLUDES,
  };
}
export async function retrieveCompanyMerchantReadiness(accountId: string) {
  const stripe = getCompanyMerchantClient();
  const account = await stripe.v2.core.accounts.retrieve(accountId, { include: MERCHANT_INCLUDES });
  const compatible = await stripe.accounts.retrieve(accountId);
  const ready = liveMerchantInvoiceCheckoutReady(account, compatible, accountId, stripeExpectedLivemode());
  return { account, ready, snapshot: { ...snapshotFromStripeAccount(compatible), modernReady: ready } };
}
