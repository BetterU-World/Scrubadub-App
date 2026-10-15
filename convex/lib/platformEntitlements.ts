import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

type DbCtx = QueryCtx | MutationCtx;

// Never derive platform authority or billing exemptions from email or role.
export async function hasPlatformAdmin(ctx: DbCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (!user || user.status !== "active") return false;
  const entitlement = await ctx.db.query("platformAdmins")
    .withIndex("by_userId", q => q.eq("userId", userId)).unique();
  return entitlement?.active === true;
}

export async function hasComplimentarySubscription(ctx: DbCtx, companyId: Id<"companies">) {
  const entitlement = await ctx.db.query("complimentarySubscriptions")
    .withIndex("by_companyId", q => q.eq("companyId", companyId)).unique();
  return entitlement?.active === true;
}
