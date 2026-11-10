import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { operationalWorkerAvailable } from "./operationalWorkerEligibility";

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
    .take(1001);
  if (memberships.length > 1000) throw new Error("Too many team memberships");
  const user = await ctx.db.get(userId);
  if (!user || user.status !== "active" || !user.companyId ||
      (companyId && companyId !== user.companyId)) return [];
  const teams = await Promise.all(memberships.map(m => ctx.db.get(m.teamId)));
  // Archive prevents new assignment, but preserves existing access.
  return memberships.filter((m, i) => m.companyId === user.companyId &&
    teams[i]?.companyId === user.companyId);
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
  const team = await ctx.db.get(teamId);
  if (!team) return [];
  const members = await ctx.db
    .query("teamMembers")
    .withIndex("by_teamId_active", (q) => q.eq("teamId", teamId).eq("active", true))
    .take(1001);
  if (members.length > 1000) throw new Error("Team is too large");
  return members.filter(m => m.companyId === team.companyId);
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
  const [team, user] = await Promise.all([ctx.db.get(teamId), ctx.db.get(userId)]);
  if (!team || !user || user.status !== "active" || user.companyId !== team.companyId) return null;
  const memberships = await ctx.db
    .query("teamMembers")
    .withIndex("by_teamId_userId", (q) => q.eq("teamId", teamId).eq("userId", userId))
    .take(2);
  return memberships.find(m => m.active && m.companyId === team.companyId) ?? null;
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
  const user = await ctx.db.get(userId);
  if (!user || user.status !== "active" || user.companyId !== job.companyId) return false;
  if (job.cleanerIds.includes(userId)) return true;
  if (!job.assignedTeamId) return false;
  const team = await ctx.db.get(job.assignedTeamId);
  return team?.companyId === job.companyId && await isActiveTeamMember(ctx, team._id, userId);
}

export async function getJobRecipientUserIds(
  ctx: Ctx,
  job: JobLike,
): Promise<Id<"users">[]> {
  const ids = new Set<Id<"users">>(job.cleanerIds);
  if (job.assignedTeamId) {
    const team = await ctx.db.get(job.assignedTeamId);
    if (team?.companyId === job.companyId) {
      const members = await getActiveTeamMemberUserIds(ctx, team._id);
      for (const id of members) ids.add(id);
    }
  }
  const users = await Promise.all([...ids].map(id => ctx.db.get(id)));
  const eligible = users.filter((user): user is NonNullable<typeof user> =>
    !!user && user.companyId === job.companyId && user.status === "active");
  const available = await Promise.all(eligible.map(user => operationalWorkerAvailable(ctx, user)));
  return eligible.filter((_, i) => available[i]).map(user => user._id);
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
  // Direct assignment grants submission authority independently of team membership.
  if (job.cleanerIds.includes(user._id)) return true;
  if (!job.assignedTeamId) return false;
  if (user.role === "owner") return true;
  if (user.role === "manager" && (user.canApproveForms || job.assignedManagerId === user._id)) return true;
  return await isActiveTeamLead(ctx, job.assignedTeamId, user._id);
}
