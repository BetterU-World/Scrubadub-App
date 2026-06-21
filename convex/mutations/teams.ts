import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireOwner, logAudit } from "../lib/helpers";
import { assertTeamInCompany } from "../lib/teams";

const memberRole = v.union(v.literal("lead"), v.literal("member"));

export const create = mutation({
  args: {
    userId: v.id("users"),
    companyId: v.id("companies"),
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    if (!owner.companyId || owner.companyId !== args.companyId) throw new Error("Not your company");
    const now = Date.now();
    const teamId = await ctx.db.insert("teams", {
      companyId: args.companyId,
      name: args.name.trim(),
      description: args.description?.trim() || undefined,
      active: true,
      createdBy: owner._id,
      createdAt: now,
      updatedAt: now,
    });
    await logAudit(ctx, {
      companyId: args.companyId,
      userId: owner._id,
      action: "create_team",
      entityType: "team",
      entityId: teamId,
    });
    return teamId;
  },
});

export const update = mutation({
  args: {
    userId: v.id("users"),
    teamId: v.id("teams"),
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    if (!owner.companyId) throw new Error("Owner company required");
    await assertTeamInCompany(ctx, args.teamId, owner.companyId);
    await ctx.db.patch(args.teamId, {
      name: args.name.trim(),
      description: args.description?.trim() || undefined,
      updatedAt: Date.now(),
    });
    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: "update_team",
      entityType: "team",
      entityId: args.teamId,
    });
  },
});

export const setActive = mutation({
  args: { userId: v.id("users"), teamId: v.id("teams"), active: v.boolean() },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    if (!owner.companyId) throw new Error("Owner company required");
    await assertTeamInCompany(ctx, args.teamId, owner.companyId);
    await ctx.db.patch(args.teamId, { active: args.active, updatedAt: Date.now() });
    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: args.active ? "reactivate_team" : "archive_team",
      entityType: "team",
      entityId: args.teamId,
    });
  },
});

export const addMember = mutation({
  args: {
    userId: v.id("users"),
    teamId: v.id("teams"),
    memberUserId: v.id("users"),
    role: memberRole,
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    if (!owner.companyId) throw new Error("Owner company required");
    const team = await assertTeamInCompany(ctx, args.teamId, owner.companyId, { requireActive: true });
    const member = await ctx.db.get(args.memberUserId);
    if (!member || member.companyId !== owner.companyId) throw new Error("User not found in your company");
    if (!["cleaner", "maintenance", "manager"].includes(member.role)) {
      throw new Error("Only cleaners, maintenance workers, and managers can join teams");
    }
    const existing = await ctx.db
      .query("teamMembers")
      .withIndex("by_teamId_userId", (q) => q.eq("teamId", args.teamId).eq("userId", args.memberUserId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        role: args.role,
        active: true,
        removedAt: undefined,
        addedAt: existing.addedAt ?? Date.now(),
      });
    } else {
      await ctx.db.insert("teamMembers", {
        teamId: args.teamId,
        companyId: team.companyId,
        userId: args.memberUserId,
        role: args.role,
        active: true,
        addedAt: Date.now(),
      });
    }
    await ctx.db.patch(args.teamId, { updatedAt: Date.now() });
  },
});

export const removeMember = mutation({
  args: { userId: v.id("users"), membershipId: v.id("teamMembers") },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const membership = await ctx.db.get(args.membershipId);
    if (!membership || membership.companyId !== owner.companyId) throw new Error("Team member not found");
    await ctx.db.patch(args.membershipId, { active: false, removedAt: Date.now() });
    await ctx.db.patch(membership.teamId, { updatedAt: Date.now() });
  },
});

export const setMemberRole = mutation({
  args: { userId: v.id("users"), membershipId: v.id("teamMembers"), role: memberRole },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const membership = await ctx.db.get(args.membershipId);
    if (!membership || membership.companyId !== owner.companyId) throw new Error("Team member not found");
    await ctx.db.patch(args.membershipId, { role: args.role });
    await ctx.db.patch(membership.teamId, { updatedAt: Date.now() });
  },
});
