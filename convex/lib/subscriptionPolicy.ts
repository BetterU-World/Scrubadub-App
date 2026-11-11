/** Billing dates use UTC calendar arithmetic, clamping a month-end to its last day. */
export const DAY = 86_400_000;
export function addMonths(timestamp: number, months: number) {
  const date = new Date(timestamp);
  const day = date.getUTCDate();
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.getTime();
}
export function winnerTrialEnd(startSeconds: number) {
  return Math.floor(addMonths((startSeconds + 14 * 86400) * 1000, 6) / 1000);
}
export type BillingSnapshot = {
  subscriptionId: string; customerId: string; status: string; renewing: boolean;
  createdAt: number; plan: string; amount: number; currency: string; interval: "month" | "year";
  intervalCount: number; anchor: number; trialEnd?: number; awardedUntil?: number;
  discounts: Array<{ id: string; description: string; start: number; end?: number }>;
};
export type NoticePlan = { kind: "confirmation" | "trial" | "promotion" | "annual"; targetAt: number; dueAt: number; expiresAt: number };

/** One annual baseline covers CA continuous service and CO's 25–40-day renewal window.
 * For monthly plans select the first renewal whose following term crosses each service anniversary.
 */
export function annualRenewal(snapshot: BillingSnapshot, now: number) {
  const step = snapshot.interval === "year" ? snapshot.intervalCount * 12 : snapshot.intervalCount;
  for (let year = 1; year <= 100; year++) {
    const anniversary = addMonths(snapshot.createdAt, year * 12);
    let index = snapshot.interval === "year" ? 1 : 0;
    while (index < 1200 && addMonths(snapshot.anchor, (index + 1) * step) <= anniversary) index++;
    const renewal = addMonths(snapshot.anchor, index * step);
    if (renewal > snapshot.createdAt && now <= renewal + DAY) return renewal;
  }
  return undefined;
}
export function noticePlans(snapshot: BillingSnapshot, now: number): NoticePlan[] {
  if (!snapshot.renewing || !["active", "trialing"].includes(snapshot.status)) return [];
  const result: NoticePlan[] = [];
  const conversion = (kind: "trial" | "promotion", targetAt: number) => {
    // Seven days, with a bounded catch-up window ending three days before expiration.
    if (targetAt > now) result.push({ kind, targetAt, dueAt: targetAt - 7 * DAY, expiresAt: targetAt - 3 * DAY });
  };
  if (snapshot.awardedUntil) conversion("promotion", snapshot.awardedUntil);
  else {
    if (snapshot.trialEnd) conversion("trial", snapshot.trialEnd);
    for (const discount of snapshot.discounts) if (discount.end && discount.end !== snapshot.trialEnd) conversion("promotion", discount.end);
  }
  const annual = annualRenewal(snapshot, now);
  if (annual !== undefined) result.push({ kind: "annual", targetAt: annual, dueAt: annual - 30 * DAY, expiresAt: annual - 25 * DAY });
  return result;
}
export function snapshotKey(snapshot: BillingSnapshot) {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => [key, canonical(v)])) : value;
  return JSON.stringify(canonical(snapshot));
}
export function noticeKey(subscriptionId: string, kind: string, targetAt: number) { return `${subscriptionId}:${kind}:${targetAt}`; }
export function noticeText(snapshot: BillingSnapshot, kind: NoticePlan["kind"], targetAt: number, appUrl: string) {
  const date = (time: number) => new Date(time).toISOString().replace("T", " ").replace(".000Z", " UTC");
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: snapshot.currency }).format(snapshot.amount / 100);
  const frequency = `every ${snapshot.intervalCount} ${snapshot.interval}${snapshot.intervalCount === 1 ? "" : "s"}`;
  const intro = kind === "confirmation" ? "Your SCRUB subscription confirmation" : kind === "annual" ? "Your SCRUB annual subscription reminder" : "Your SCRUB free or discounted period is ending";
  const lines = [intro, `Plan: ${snapshot.plan}. Regular recurring price: ${amount} ${frequency}.`,
    snapshot.renewing ? "Your subscription renews automatically unless you cancel before the next charge." : "Automatic renewal is canceled. This message does not announce a future renewal."];
  if (snapshot.trialEnd && !snapshot.awardedUntil) lines.push(`Trial ends: ${date(snapshot.trialEnd)}.`);
  if (snapshot.awardedUntil) lines.push(`Winner offer: standard 14-day trial plus six additional calendar months, through ${date(snapshot.awardedUntil)}. Canceling automatic renewal preserves this awarded access.`);
  for (const d of snapshot.discounts) lines.push(`Promotion: ${d.description}; ${d.end ? `ends ${date(d.end)}` : "no fixed expiration reported by Stripe"}.`);
  if (kind === "annual") lines.push(`Upcoming renewal: ${date(targetAt)}. The following term is ${frequency}.`);
  if (kind === "promotion" && !snapshot.awardedUntil) lines.push(`The discounted period ends ${date(targetAt)}; regular pricing resumes on subsequent applicable billing. This expiration is not a promised first-charge date.`);
  if (snapshot.awardedUntil && snapshot.renewing) lines.push(`Scheduled first regular-price billing: ${date(snapshot.awardedUntil)}; credits or taxes may change the invoice total.`);
  if (!snapshot.awardedUntil && snapshot.trialEnd && snapshot.discounts.length === 0 && snapshot.renewing) lines.push(`Scheduled paid billing begins after the free period on ${date(snapshot.trialEnd)}; credits or taxes may change the invoice total.`);
  lines.push(`Cancel online: sign in at ${appUrl}/login, then use Cancel automatic renewal in Settings > Billing. Settings > Billing > Manage Billing provides other subscription management. Access continues through the scheduled subscription end.`,
    "If account setup is unfinished, complete the setup link returned by Checkout; contact scrubadubsolutionsllc@gmail.com for help.",
    "Support: scrubadubsolutionsllc@gmail.com. Keep this confirmation for your records.");
  return { subject: intro, text: lines.join("\n\n") };
}
