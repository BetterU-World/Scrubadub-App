import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

export type TeamAssignmentRole = "lead" | "member";

type Ctx = QueryCtx | MutationCtx;

type JobLike = {
  companyId: Id<"companies">;
  cleanerIds: Id<"users">[];
  assignedTeamId?: Id<"teams">;
  assignedManagerId?: Id<"users">;
};

export async function getActiveTeamMembershipsForUser(
  ctx: Ctx,
  userId: Id<"users">,
  companyId?: Id<"companies">,
) {
  const memberships = await ctx.db
    .query("teamMembers")
    .withIndex("by_userId_active", (q) => q.eq("userId", userId).eq("active", true))
    .collect();
  return companyId ? memberships.filter((m) => m.companyId === companyId) : memberships;
}

export async function getActiveTeamIdsForUser(
  ctx: Ctx,
  userId: Id<"users">,
  companyId?: Id<"companies">,
): Promise<Set<Id<"teams">>> {
  const memberships = await getActiveTeamMembershipsForUser(ctx, userId, companyId);
  return new Set(memberships.map((m) => m.teamId));
}

export async function getActiveTeamMembers(
  ctx: Ctx,
  teamId: Id<"teams">,
) {
  return await ctx.db
    .query("teamMembers")
    .withIndex("by_teamId", (q) => q.eq("teamId", teamId))
    .filter((q) => q.eq(q.field("active"), true))
    .collect();
}

export async function getActiveTeamMemberUserIds(
  ctx: Ctx,
  teamId: Id<"teams">,
): Promise<Id<"users">[]> {
  const members = await getActiveTeamMembers(ctx, teamId);
  return members.map((m) => m.userId);
}

export async function getActiveTeamMembership(
  ctx: Ctx,
  teamId: Id<"teams">,
  userId: Id<"users">,
) {
  return await ctx.db
    .query("teamMembers")
    .withIndex("by_teamId_userId", (q) => q.eq("teamId", teamId).eq("userId", userId))
    .filter((q) => q.eq(q.field("active"), true))
    .first();
}

export async function isActiveTeamMember(
  ctx: Ctx,
  teamId: Id<"teams"> | undefined,
  userId: Id<"users">,
): Promise<boolean> {
  if (!teamId) return false;
  const membership = await getActiveTeamMembership(ctx, teamId, userId);
  return !!membership;
}

export async function isActiveTeamLead(
  ctx: Ctx,
  teamId: Id<"teams"> | undefined,
  userId: Id<"users">,
): Promise<boolean> {
  if (!teamId) return false;
  const membership = await getActiveTeamMembership(ctx, teamId, userId);
  return membership?.role === "lead";
}

export async function isUserAssignedToJob(
  ctx: Ctx,
  job: JobLike,
  userId: Id<"users">,
): Promise<boolean> {
  if (job.cleanerIds.includes(userId)) return true;
  return await isActiveTeamMember(ctx, job.assignedTeamId, userId);
}

export async function getJobRecipientUserIds(
  ctx: Ctx,
  job: JobLike,
): Promise<Id<"users">[]> {
  const ids = new Set<Id<"users">>(job.cleanerIds);
  if (job.assignedTeamId) {
    const members = await getActiveTeamMemberUserIds(ctx, job.assignedTeamId);
    for (const id of members) ids.add(id);
  }
  return [...ids];
}

export async function assertTeamInCompany(
  ctx: Ctx,
  teamId: Id<"teams">,
  companyId: Id<"companies">,
  opts: { requireActive?: boolean } = {},
) {
  const team = await ctx.db.get(teamId);
  if (!team || team.companyId !== companyId) throw new Error("Team not found");
  if (opts.requireActive && !team.active) throw new Error("Team is archived");
  return team;
}

export async function canSubmitFinalJob(
  ctx: Ctx,
  job: JobLike,
  user: { _id: Id<"users">; role: string; companyId?: Id<"companies">; canApproveForms?: boolean },
): Promise<boolean> {
  if (user.companyId !== job.companyId) return false;
  if (!job.assignedTeamId) return job.cleanerIds.includes(user._id);
  if (user.role === "owner") return true;
  if (user.role === "manager" && (user.canApproveForms || job.assignedManagerId === user._id)) return true;
  return await isActiveTeamLead(ctx, job.assignedTeamId, user._id);
}
