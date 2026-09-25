/** Card-only Checkout keeps V1 on immediate-confirmation payment methods. */
export function invoiceCheckoutParameters(attempt: {
  _id: string; invoiceId: string; companyId: string; amountCents: number; destinationStripeAccountId: string;
}, invoiceNumber: string, appUrl: string) {
  const metadata = { type: "invoice_payment", invoicePaymentAttemptId: String(attempt._id), invoiceId: String(attempt.invoiceId), companyId: String(attempt.companyId) };
  return {
    parameters: {
      mode: "payment" as const,
      payment_method_types: ["card" as const],
      line_items: [{ price_data: { currency: "usd", product_data: { name: `Invoice ${invoiceNumber}` }, unit_amount: attempt.amountCents }, quantity: 1 }],
      payment_intent_data: { transfer_data: { destination: attempt.destinationStripeAccountId }, application_fee_amount: 200, metadata: { invoicePaymentAttemptId: metadata.invoicePaymentAttemptId, invoiceId: metadata.invoiceId, companyId: metadata.companyId } },
      metadata,
      success_url: `${appUrl}/client/billing?invoice_payment=processing`,
      cancel_url: `${appUrl}/client/billing?invoice_payment=cancel`,
    },
    options: { idempotencyKey: `invoice-payment-attempt:${attempt._id}` },
  };
}
