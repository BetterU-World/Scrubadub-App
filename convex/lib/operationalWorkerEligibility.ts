import type { Doc } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";

/** Legacy workers may have no profile. An explicitly disabled profile must not receive new work communications. */
export async function operationalWorkerAvailable(ctx: QueryCtx | MutationCtx, user: Doc<"users">) {
  if (user.status !== "active") return false;
  const profile = await ctx.db.query("workerProfiles").withIndex("by_userId", q => q.eq("userId", user._id)).first();
  return !profile || (profile.companyId === user.companyId && !["inactive", "archived"].includes(profile.workerStatus));
}
