import type Stripe from "stripe";
export type PaymentAttemptContext = { chargeModel?: "destination" | "direct"; connectedStripeAccountId?: string; destinationStripeAccountId?: string };
export function computeInvoicePlatformFee(amountCents: number): number {
  if (!Number.isSafeInteger(amountCents) || amountCents < 50) throw new Error("Invoice total is not payable online");
  return amountCents < 3000 ? 0 : 200;
}
export function resolvePaymentAttemptChargeModel(attempt: PaymentAttemptContext) { return attempt.chargeModel ?? "destination"; }
export function paymentAttemptAccountId(attempt: PaymentAttemptContext): string {
  const id = resolvePaymentAttemptChargeModel(attempt) === "direct" ? attempt.connectedStripeAccountId : attempt.destinationStripeAccountId;
  if (!id || !id.startsWith("acct_")) throw new Error("Payment account context is missing");
  return id;
}
export function getStripeRequestContextForAttempt(attempt: PaymentAttemptContext): Stripe.RequestOptions {
  const id = paymentAttemptAccountId(attempt);
  return resolvePaymentAttemptChargeModel(attempt) === "direct" ? { stripeAccount: id } : {};
}
export function validatePaymentEventAccount(attempt: PaymentAttemptContext, eventAccount?: string, source?: string): boolean {
  try { return resolvePaymentAttemptChargeModel(attempt) === "direct" ? source === "connect" && eventAccount === paymentAttemptAccountId(attempt) : source === "account" && !eventAccount && !!paymentAttemptAccountId(attempt); }
  catch { return false; }
}
export function retrieveCheckoutSessionForAttempt(stripe: Stripe, attempt: PaymentAttemptContext, id: string) { return stripe.checkout.sessions.retrieve(id, {}, getStripeRequestContextForAttempt(attempt)); }
export function retrievePaymentIntentForAttempt(stripe: Stripe, attempt: PaymentAttemptContext, id: string) { return stripe.paymentIntents.retrieve(id, {}, getStripeRequestContextForAttempt(attempt)); }
export function expireCheckoutSessionForAttempt(stripe: Stripe, attempt: PaymentAttemptContext, id: string) { return stripe.checkout.sessions.expire(id, {}, getStripeRequestContextForAttempt(attempt)); }
