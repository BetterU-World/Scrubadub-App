const PAST_DUE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_DATE_MS = 8_640_000_000_000_000;

/** Stripe timestamps are seconds. Persist application timestamps as milliseconds. */
function stripeSecondsToMilliseconds(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) return undefined;
  const milliseconds = value * 1000;
  return Number.isSafeInteger(milliseconds) && milliseconds <= MAX_DATE_MS ? milliseconds : undefined;
}

/** Read compatibility for existing epoch-second records; no database migration. */
export function storedSubscriptionPeriodEndMs(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) return undefined;
  // Contemporary epoch seconds are below this boundary; epoch milliseconds are above it.
  return value < 100_000_000_000 ? stripeSecondsToMilliseconds(value) : value <= MAX_DATE_MS ? value : undefined;
}

export function subscriptionPeriodEndMs(subscription: {
  current_period_end?: unknown;
  items?: { data?: Array<{ current_period_end?: unknown }> };
}): number | undefined {
  const items = subscription.items?.data;
  if (items != null && (!Array.isArray(items) || items.some(item => !item || typeof item !== "object"))) return undefined;
  if (items?.some(item => Object.prototype.hasOwnProperty.call(item, "current_period_end"))) {
    const periods = items.map(item => stripeSecondsToMilliseconds(item.current_period_end));
    if (periods.some(period => period === undefined)) return undefined;
    // SCRUB sells one plan. If multiple periods appear, never extend grace past the earliest.
    return Math.min(...periods as number[]);
  }
  // Pre-Basil snapshots have no item-level period fields.
  return stripeSecondsToMilliseconds(subscription.current_period_end);
}

function stripeObjectId(value: unknown): string | undefined {
  const id = typeof value === "string" ? value : value && typeof value === "object" && "id" in value ? value.id : undefined;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

export function invoiceSubscriptionId(invoice: {
  subscription?: unknown;
  parent?: { type?: string; subscription_details?: { subscription?: unknown } | null } | null;
}): string | undefined {
  if (invoice.parent != null) {
    return invoice.parent.type === "subscription_details" ? stripeObjectId(invoice.parent.subscription_details?.subscription) : undefined;
  }
  return stripeObjectId(invoice.subscription);
}

/** Existing product policy, with explicit timestamp validation and legacy read support. */
export function subscriptionAllowsWrites(status: string | undefined, periodEnd: unknown, now = Date.now()): boolean {
  if (!status || status === "active" || status === "trialing") return true;
  const periodEndMs = storedSubscriptionPeriodEndMs(periodEnd);
  return status === "past_due" && periodEndMs !== undefined && now < periodEndMs + PAST_DUE_GRACE_MS;
}
