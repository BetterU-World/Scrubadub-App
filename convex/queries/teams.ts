import { query } from "../_generated/server";
import { v } from "convex/values";
import { getSessionUser } from "../lib/auth";
import { requireOwnerManagerCompany } from "../lib/sessionAuth";

async function withMembers(ctx: any, team: any) {
  const memberships = await ctx.db
    .query("teamMembers")
    .withIndex("by_teamId", (q: any) => q.eq("teamId", team._id))
    .collect();
  const users = await Promise.all(memberships.map((m: any) => ctx.db.get(m.userId)));
  return {
    ...team,
    members: memberships.map((m: any, idx: number) => ({
      ...m,
      user: users[idx]
        ? {
            _id: users[idx]._id,
            name: users[idx].name,
            email: users[idx].email,
            role: users[idx].role,
            status: users[idx].status,
          }
        : null,
    })),
    activeMemberCount: memberships.filter((m: any) => m.active).length,
    leads: memberships
      .map((m: any, idx: number) => ({ membership: m, user: users[idx] }))
      .filter(({ membership, user }: any) => membership.active && membership.role === "lead" && user)
      .map(({ user }: any) => ({ _id: user._id, name: user.name })),
  };
}

export const list = query({
  args: {
    companyId: v.id("companies"),
    userId: v.id("users"),
    sessionToken: v.string(),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireOwnerManagerCompany(ctx, args.sessionToken, args.companyId, args.userId);
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
    const filtered = args.includeArchived ? teams : teams.filter((t) => t.active);
    filtered.sort((a, b) => a.name.localeCompare(b.name));
    return await Promise.all(filtered.map((team) => withMembers(ctx, team)));
  },
});

export const listActiveForAssignment = query({
  args: { companyId: v.id("companies"), userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireOwnerManagerCompany(ctx, args.sessionToken, args.companyId, args.userId);
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_companyId_active", (q) => q.eq("companyId", args.companyId).eq("active", true))
      .collect();
    teams.sort((a, b) => a.name.localeCompare(b.name));
    return teams;
  },
});

export const listMyTeams = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);
    if (!user.companyId) return [];
    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_userId_active", (q) => q.eq("userId", user._id).eq("active", true))
      .collect();
    const teams = await Promise.all(memberships.map((m) => ctx.db.get(m.teamId)));
    return teams
      .filter((team): team is NonNullable<typeof team> => !!team && team.companyId === user.companyId && team.active)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const get = query({
  args: { teamId: v.id("teams"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);
    const team = await ctx.db.get(args.teamId);
    if (!team) return null;
    if (!user.companyId || team.companyId !== user.companyId) throw new Error("Access denied");
    return await withMembers(ctx, team);
  },
});
