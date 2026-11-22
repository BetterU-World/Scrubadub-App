import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { companySubscriptionAllowsWrites } from "./subscriptionGating";

export async function smartEstimatesAuthoringEnabled(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  surface: "estimates" | "brandedProposal",
) {
  if (process.env.SCRUB_SMART_ESTIMATES_RELEASE_ENABLED === "true") {
    const company = await ctx.db.get(companyId);
    return company !== null && await companySubscriptionAllowsWrites(ctx, company);
  }

  return companyId === (surface === "estimates"
    ? process.env.SCRUB_SMART_ESTIMATES_PREVIEW_COMPANY_ID
    : process.env.SCRUB_BRANDED_PROPOSAL_PREVIEW_COMPANY_ID);
}
