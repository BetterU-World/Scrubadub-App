import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { isRoleCompatibleWithJobExecution } from "./jobExecutionAuth";

type Ctx = MutationCtx | QueryCtx;
const MAX_RECIPIENTS = 1000;

/** Review communications only; do not change execution/access or other notification audiences. */
export async function completionOwners(ctx: Ctx, companyId: Id<"companies">) {
  const owners = await ctx.db.query("users")
    .withIndex("by_companyId_role", q => q.eq("companyId", companyId).eq("role", "owner"))
    .take(MAX_RECIPIENTS + 1);
  if (owners.length > MAX_RECIPIENTS) throw new Error("Too many completion recipients");
  return owners.filter(owner => owner.status === "active");
}

export async function currentReviewWorkers(ctx: Ctx, job: Doc<"jobs">) {
  const ids = new Set(job.cleanerIds);
  if (ids.size > MAX_RECIPIENTS) throw new Error("Too many review recipients");
  if (job.assignedTeamId) {
    const team = await ctx.db.get(job.assignedTeamId);
    // Archived teams retain existing member access; archiving is not revocation.
    if (team?.companyId === job.companyId) {
      const members = await ctx.db.query("teamMembers")
        .withIndex("by_teamId_active", q => q.eq("teamId", team._id).eq("active", true))
        .take(MAX_RECIPIENTS + 1);
      if (members.length > MAX_RECIPIENTS) throw new Error("Too many review recipients");
      for (const member of members) if (member.companyId === job.companyId) ids.add(member.userId);
    }
  }
  if (ids.size > MAX_RECIPIENTS) throw new Error("Too many review recipients");
  const users = await Promise.all([...ids].map(id => ctx.db.get(id)));
  return users.filter((user): user is Doc<"users"> => !!user && user.companyId === job.companyId &&
    user.status === "active" && isRoleCompatibleWithJobExecution(user.role, job.type));
}
