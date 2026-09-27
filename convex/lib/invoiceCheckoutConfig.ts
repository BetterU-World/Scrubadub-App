import { getStripeRequestContextForAttempt, paymentAttemptAccountId, PaymentAttemptContext } from "./invoiceStripeContext";
/** Direct charges keep invoice payment processing economics on the company. */
export function invoiceCheckoutParameters(attempt: {
  _id: string; invoiceId: string; companyId: string; amountCents: number; platformFeeCents: number;
} & PaymentAttemptContext, invoiceNumber: string, appUrl: string) {
  if (attempt.chargeModel !== "direct") throw new Error("Reconnect Stripe before starting a new payment");
  if (![0, 200].includes(attempt.platformFeeCents) || attempt.platformFeeCents > attempt.amountCents) throw new Error("Invalid frozen platform fee");
  const metadata = { type: "invoice_payment", invoicePaymentAttemptId: String(attempt._id), invoiceId: String(attempt.invoiceId), companyId: String(attempt.companyId) };
  return {
    parameters: {
      mode: "payment" as const,
      payment_method_types: ["card" as const],
      line_items: [{ price_data: { currency: "usd", product_data: { name: `Invoice ${invoiceNumber}` }, unit_amount: attempt.amountCents }, quantity: 1 }],
      payment_intent_data: { ...(attempt.platformFeeCents > 0 ? { application_fee_amount: attempt.platformFeeCents } : {}), metadata: { invoicePaymentAttemptId: metadata.invoicePaymentAttemptId, invoiceId: metadata.invoiceId, companyId: metadata.companyId } },
      metadata,
      success_url: `${appUrl}/client/billing?invoice_payment=processing`,
      cancel_url: `${appUrl}/client/billing?invoice_payment=cancel`,
    },
    options: { ...getStripeRequestContextForAttempt(attempt), idempotencyKey: `invoice-payment-attempt:direct:${paymentAttemptAccountId(attempt)}:${attempt._id}` },
  };
}
