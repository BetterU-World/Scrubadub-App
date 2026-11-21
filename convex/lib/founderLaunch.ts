/** Immutable per-deployment rollout instant; never infer it from current server time. */
export function founderStripeLaunchSeconds(): number | null {
  const value = process.env.SCRUB_FOUNDER_STRIPE_LAUNCH_AT?.trim();
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().replace(".000Z", "Z") !== value) return null;
  return parsed / 1000;
}

export function eligibleFounderStripeDetails(kind: string, details: Record<string, string>): boolean {
  if (kind !== "access" && kind !== "paid") return true;
  const launch = founderStripeLaunchSeconds();
  const timestamp = Number(details[kind === "access" ? "Subscription created" : "Paid at"]);
  return launch !== null && Number.isSafeInteger(timestamp) && timestamp > 0 && timestamp >= launch;
}

/** Only founder work is passed here. Canonical billing errors retain their normal retry semantics. */
export async function bestEffortFounder(work: () => Promise<unknown>): Promise<void> {
  try { await work(); }
  catch { console.warn("[FOUNDER-NOTIFICATIONS] Recording failed; canonical billing continues. Investigate missing founder events."); }
}
