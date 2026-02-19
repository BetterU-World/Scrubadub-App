import { QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/** Grace period for past_due invoices: 3 days in ms */
const PAST_DUE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Check if a company's subscription allows write operations.
 *
 * Rules:
 * - active / trialing → allow
 * - past_due AND within 3-day grace window from currentPeriodEnd → allow
 * - no subscription record (new/legacy company) → allow (graceful default)
 * - otherwise → read-only (throw)
 */
export async function requireActiveSubscription(
  ctx: QueryCtx,
  companyId: Id<"companies">
): Promise<void> {
  const company = await ctx.db.get(companyId);
  if (!company) throw new Error("Company not found");

  const status = company.subscriptionStatus;

  // No subscription info yet → allow (new or legacy company)
  if (!status) return;

  // Active or trialing → allow
  if (status === "active" || status === "trialing") return;

  // Past due with grace window
  if (status === "past_due") {
    const periodEnd = company.currentPeriodEnd ?? 0;
    if (Date.now() < periodEnd + PAST_DUE_GRACE_MS) return;
  }

  throw new Error(
    "Your subscription is inactive. Please update your billing to continue creating content."
  );
}
