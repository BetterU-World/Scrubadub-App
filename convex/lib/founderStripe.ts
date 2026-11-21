import type Stripe from "stripe";
import { invoiceSubscriptionId } from "./stripeSubscriptionCompatibility";

const idOf = (value: string | { id: string } | null | undefined) => typeof value === "string" ? value : value?.id;

/** Invoice allocation plus successful money movement, not invoice.amount_paid alone. */
export async function collectedSubscriptionPayment(stripe: Stripe, invoice: Stripe.Invoice): Promise<number> {
  if (!invoiceSubscriptionId(invoice) || invoice.status !== "paid" || invoice.amount_paid <= 0) return 0;
  let collected = 0;
  for await (const allocation of stripe.invoicePayments.list({ invoice: invoice.id, status: "paid", limit: 100 })) {
    if (!allocation.amount_paid || allocation.amount_paid <= 0) continue;
    if (allocation.payment.type === "payment_intent") {
      const id = idOf(allocation.payment.payment_intent);
      if (!id) continue;
      const intent = await stripe.paymentIntents.retrieve(id);
      if (intent.status === "succeeded" && intent.amount_received > 0 && intent.currency === invoice.currency && idOf(intent.customer) === idOf(invoice.customer)) {
        collected += Math.min(allocation.amount_paid, intent.amount_received);
      }
    } else if (allocation.payment.type === "charge") {
      const id = idOf(allocation.payment.charge);
      if (!id) continue;
      const charge = await stripe.charges.retrieve(id);
      if (charge.paid && charge.status === "succeeded" && charge.amount_captured > 0 && charge.currency === invoice.currency && idOf(charge.customer) === idOf(invoice.customer)) collected += Math.min(allocation.amount_paid, charge.amount_captured);
    }
    // Credits, out-of-band settlement and payment records are not proof of collection.
  }
  return collected;
}

/** Do not announce an existing subscriber's renewal as their first conversion. */
export async function firstCompanyPayment(stripe: Stripe, customerId: string, current: Stripe.Invoice) {
  let earliest: { invoice: Stripe.Invoice; amount: number } | null = null;
  let count = 0;
  for await (const invoice of stripe.invoices.list({ customer: customerId, status: "paid", limit: 100 })) {
    // Fail for webhook retry/manual investigation rather than infer from truncated history.
    if (++count > 1000) throw new Error("Founder payment history exceeds review bound");
    const amount = await collectedSubscriptionPayment(stripe, invoice);
    if (!amount) continue;
    const paidAt = invoice.status_transitions.paid_at ?? invoice.created;
    const previousAt = earliest && (earliest.invoice.status_transitions.paid_at ?? earliest.invoice.created);
    if (!earliest || paidAt < previousAt! || (paidAt === previousAt && invoice.id < earliest.invoice.id)) earliest = { invoice, amount };
  }
  if (!earliest) return undefined;
  return { Invoice: earliest.invoice.id, Amount: String(earliest.amount), "Amount unit": "minor currency units", Subscription: invoiceSubscriptionId(earliest.invoice)!, Currency: earliest.invoice.currency,
    Timestamp: new Date((earliest.invoice.status_transitions.paid_at ?? earliest.invoice.created) * 1000).toISOString(),
    Event: current.id === earliest.invoice.id ? "first_payment" : "historical_payment" };
}

export function founderAccess(subscription: Stripe.Subscription, timestamp: number) {
  if (!["active", "trialing"].includes(subscription.status)) return undefined;
  const discounts = (subscription.discounts ?? []).map(discount => typeof discount === "string" ? discount : discount.id);
  const promotions = (subscription.discounts ?? []).flatMap(discount => typeof discount === "string" ? [] : [idOf(discount.promotion_code), idOf(discount.source?.coupon)].filter((id): id is string => !!id));
  return { Status: subscription.status, Plan: subscription.items.data[0]?.price.id ?? "Unavailable",
    Timestamp: new Date(timestamp * 1000).toISOString(),
    ...(subscription.trial_end ? { "Trial end": new Date(subscription.trial_end * 1000).toISOString() } : {}),
    ...(promotions.length ? { "Coupon/promotion": promotions.join(", ") } : {}),
    ...(discounts.length ? { "Stripe discounts": discounts.join(", ") } : {}),
  };
}
