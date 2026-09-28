import { QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { isFounderEmail } from "./founderEmails";
import { subscriptionAllowsWrites } from "./stripeSubscriptionCompatibility";

/**
 * Check if a company's subscription allows write operations.
 *
 * Rules:
 * - founder/internal-tester company (owner email in allowlist) → allow
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

  // Founder/internal-tester bypass — mirrors the frontend companyBypassed check
  const owners = await ctx.db
    .query("users")
    .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
    .filter((q) => q.eq(q.field("role"), "owner"))
    .collect();
  if (owners.some((u) => isFounderEmail(u.email))) return;

  if (subscriptionAllowsWrites(company.subscriptionStatus, company.currentPeriodEnd)) return;

  throw new Error(
    "Your subscription is inactive. Please update your billing to continue creating content."
  );
}
