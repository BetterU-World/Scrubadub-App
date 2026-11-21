import { founderStripeLaunchSeconds } from "./founderLaunch";
import type Stripe from "stripe";
import { invoiceSubscriptionId } from "./stripeSubscriptionCompatibility";

const idOf = (value: string | { id: string } | null | undefined) => typeof value === "string" ? value : value?.id;

/** Invoice allocation plus successful money movement, not invoice.amount_paid alone. */
export async function collectedSubscriptionPayment(stripe: Stripe, invoice: Stripe.Invoice): Promise<number> {
  return (await collectionEvidence(stripe, invoice)).amount;
}

async function collectionEvidence(stripe: Stripe, invoice: Stripe.Invoice) {
  if (!invoiceSubscriptionId(invoice) || invoice.status !== "paid" || invoice.amount_paid <= 0) return { amount: 0, paidAt: null };
  let collected = 0;
  let paidAt: number | null = null;
  for await (const allocation of stripe.invoicePayments.list({ invoice: invoice.id, status: "paid", limit: 100 })) {
    if (!allocation.amount_paid || allocation.amount_paid <= 0) continue;
    let amount = 0;
    if (allocation.payment.type === "payment_intent") {
      const id = idOf(allocation.payment.payment_intent);
      if (!id) continue;
      const intent = await stripe.paymentIntents.retrieve(id);
      if (intent.status === "succeeded" && intent.amount_received > 0 && intent.currency === invoice.currency && idOf(intent.customer) === idOf(invoice.customer)) {
        amount = Math.min(allocation.amount_paid, intent.amount_received);
      }
    } else if (allocation.payment.type === "charge") {
      const id = idOf(allocation.payment.charge);
      if (!id) continue;
      const charge = await stripe.charges.retrieve(id);
      if (charge.paid && charge.status === "succeeded" && charge.amount_captured > 0 && charge.currency === invoice.currency && idOf(charge.customer) === idOf(invoice.customer)) amount = Math.min(allocation.amount_paid, charge.amount_captured);
    }
    if (amount > 0) {
      // The first real allocation may precede invoice settlement (e.g. partial payments).
      const timestamp = allocation.status_transitions?.paid_at;
      if (!Number.isSafeInteger(timestamp) || timestamp! <= 0) throw new Error("Missing verified collection timestamp");
      paidAt = paidAt === null ? timestamp! : Math.min(paidAt, timestamp!);
      collected += amount;
    }
    // Credits, out-of-band settlement and payment records are not proof of collection.
  }
  return { amount: collected, paidAt };
}

/** Do not announce an existing subscriber's renewal as their first conversion. */
export async function firstCompanyPayment(stripe: Stripe, customerId: string, _triggeringInvoice: Stripe.Invoice) {
  const launch = founderStripeLaunchSeconds();
  if (launch === null) return undefined;
  let earliest: { invoice: Stripe.Invoice; amount: number; paidAt: number } | null = null;
  let count = 0;
  for await (const invoice of stripe.invoices.list({ customer: customerId, status: "paid", limit: 100 })) {
    // Fail for webhook retry/manual investigation rather than infer from truncated history.
    if (++count > 1000) throw new Error("Founder payment history exceeds review bound");
    const { amount, paidAt } = await collectionEvidence(stripe, invoice);
    if (!amount) continue;
    if (!earliest || paidAt! < earliest.paidAt || (paidAt === earliest.paidAt && invoice.id < earliest.invoice.id)) earliest = { invoice, amount, paidAt: paidAt! };
  }
  const paidAt = earliest?.paidAt;
  if (!earliest || !Number.isSafeInteger(paidAt) || paidAt! < launch) return undefined;
  return { Invoice: earliest.invoice.id, Amount: String(earliest.amount), "Amount unit": "minor currency units", Subscription: invoiceSubscriptionId(earliest.invoice)!, Currency: earliest.invoice.currency,
    Timestamp: new Date(paidAt! * 1000).toISOString(),
    "Paid at": String(paidAt), Event: "first_payment" };
}

export function founderAccess(subscription: Stripe.Subscription, timestamp: number) {
  const launch = founderStripeLaunchSeconds();
  if (launch === null) {
    console.warn("[FOUNDER-NOTIFICATIONS] Set SCRUB_FOUNDER_STRIPE_LAUNCH_AT to a fixed UTC launch instant; Stripe notifications disabled.");
    return undefined;
  }
  if (!Number.isSafeInteger(subscription.created) || subscription.created < launch) return undefined;
  if (!["active", "trialing"].includes(subscription.status)) return undefined;
  const discounts = (subscription.discounts ?? []).map(discount => typeof discount === "string" ? discount : discount.id);
  const promotions = (subscription.discounts ?? []).flatMap(discount => typeof discount === "string" ? [] : [idOf(discount.promotion_code), idOf(discount.source?.coupon)].filter((id): id is string => !!id));
  return { "Subscription created": String(subscription.created), Status: subscription.status, Plan: subscription.items.data[0]?.price.id ?? "Unavailable",
    Timestamp: new Date(timestamp * 1000).toISOString(),
    ...(subscription.trial_end ? { "Trial end": new Date(subscription.trial_end * 1000).toISOString() } : {}),
    ...(promotions.length ? { "Coupon/promotion": promotions.join(", ") } : {}),
    ...(discounts.length ? { "Stripe discounts": discounts.join(", ") } : {}),
  };
}
