import type { Doc } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";

/** Account status and role/capability checks remain independent of this gate.
 * Owner lifecycle is independent. Missing and pending
 * profiles retain compatibility; ambiguous or foreign profiles fail closed.
 */
export async function workerProfileAllowsStaffAccess(ctx: QueryCtx | MutationCtx, user: Doc<"users">) {
  if (user.role === "owner") return true;
  const profiles = await ctx.db.query("workerProfiles")
    .withIndex("by_userId", q => q.eq("userId", user._id)).take(2);
  if (!profiles.length) return true;
  if (profiles.length !== 1) return false;
  const profile = profiles[0];
  return profile.companyId === user.companyId &&
    profile.workerStatus !== "inactive" && profile.workerStatus !== "archived";
}
