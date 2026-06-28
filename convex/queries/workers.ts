import { query } from "../_generated/server";
import { v } from "convex/values";
import { assertOwnerRole, getSessionUser } from "../lib/auth";

const workerRoleValues = ["cleaner", "manager", "maintenance"] as const;

async function getProfileForUser(ctx: any, userId: any) {
  return await ctx.db
    .query("workerProfiles")
    .withIndex("by_userId", (q: any) => q.eq("userId", userId))
    .first();
}

async function getOwnedProfile(ctx: any, profileId: any, ownerCompanyId: any) {
  const profile = await ctx.db.get(profileId);
  if (!profile || profile.companyId !== ownerCompanyId) {
    throw new Error("Worker profile not found");
  }
  return profile;
}

async function enrichProfile(ctx: any, profile: any) {
  const user = await ctx.db.get(profile.userId);
  return {
    ...profile,
    user: user
      ? {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          phone: user.phone,
          stripeConnectAccountId: user.stripeConnectAccountId ?? null,
          stripeConnectOnboardingStatus: user.stripeConnectOnboardingStatus ?? null,
          stripeConnectPayoutsEnabled: user.stripeConnectPayoutsEnabled ?? null,
        }
      : null,
  };
}

export const listWorkersForCompany = query({
  args: {
    userId: v.id("users"),
    companyId: v.optional(v.id("companies")),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const owner = await assertOwnerRole(ctx, args.userId);
    const companyId = args.companyId ?? owner.companyId;
    if (companyId !== owner.companyId) throw new Error("Access denied");

    const db: any = ctx.db;
    const profiles = await db
      .query("workerProfiles")
      .withIndex("by_companyId", (q: any) => q.eq("companyId", companyId))
      .collect();

    const filtered = args.includeArchived
      ? profiles
      : profiles.filter((p: any) => p.workerStatus !== "archived");

    const enriched = await Promise.all(filtered.map((p: any) => enrichProfile(ctx, p)));
    enriched.sort((a: any, b: any) => (a.user?.name ?? "").localeCompare(b.user?.name ?? ""));
    return enriched;
  },
});

export const getWorkerDetail = query({
  args: {
    userId: v.id("users"),
    workerProfileId: v.optional(v.id("workerProfiles")),
    workerUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const owner = await assertOwnerRole(ctx, args.userId);
    if (!args.workerProfileId && !args.workerUserId) {
      throw new Error("Worker profile or user required");
    }

    const db: any = ctx.db;
    const profile = args.workerProfileId
      ? await getOwnedProfile(ctx, args.workerProfileId, owner.companyId)
      : await getProfileForUser({ ...ctx, db }, args.workerUserId);

    if (!profile || profile.companyId !== owner.companyId) {
      throw new Error("Worker profile not found");
    }

    const [user, documents, onboardingItems, memberships] = await Promise.all([
      ctx.db.get(profile.userId),
      db
        .query("workerDocuments")
        .withIndex("by_workerProfileId", (q: any) => q.eq("workerProfileId", profile._id))
        .collect(),
      db
        .query("workerOnboardingItems")
        .withIndex("by_workerProfileId", (q: any) => q.eq("workerProfileId", profile._id))
        .collect(),
      ctx.db
        .query("teamMembers")
        .withIndex("by_userId", (q) => q.eq("userId", profile.userId))
        .collect(),
    ]);

    const teamDocs: any[] = await Promise.all(memberships.map((m: any) => ctx.db.get(m.teamId)));
    const teams = memberships.map((m: any, idx: number) => ({
      ...m,
      team: teamDocs[idx]
        ? {
            _id: teamDocs[idx]!._id,
            name: teamDocs[idx]!.name,
            active: teamDocs[idx]!.active,
          }
        : null,
    }));

    return {
      ...profile,
      user,
      documents,
      onboardingItems,
      teams,
    };
  },
});

export const getWorkerProfileForUser = query({
  args: {
    userId: v.id("users"),
    workerUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const sessionUser = await getSessionUser(ctx, args.userId);
    const targetUserId = args.workerUserId ?? sessionUser._id;
    const profile = await getProfileForUser(ctx, targetUserId);
    if (!profile) return null;

    const isSelf = sessionUser._id === profile.userId;
    const isOwnerInCompany = sessionUser.role === "owner" && sessionUser.companyId === profile.companyId;
    if (!isSelf && !isOwnerInCompany) throw new Error("Access denied");

    return await enrichProfile(ctx, profile);
  },
});

export const listWorkerDocuments = query({
  args: {
    userId: v.id("users"),
    workerProfileId: v.id("workerProfiles"),
  },
  handler: async (ctx, args) => {
    const sessionUser = await getSessionUser(ctx, args.userId);
    const db: any = ctx.db;
    const profile = await db.get(args.workerProfileId);
    if (!profile) throw new Error("Worker profile not found");

    const isSelf = sessionUser._id === profile.userId;
    const isOwnerInCompany = sessionUser.role === "owner" && sessionUser.companyId === profile.companyId;
    if (!isSelf && !isOwnerInCompany) throw new Error("Access denied");

    return await db
      .query("workerDocuments")
      .withIndex("by_workerProfileId", (q: any) => q.eq("workerProfileId", args.workerProfileId))
      .collect();
  },
});

export const listWorkerOnboardingItems = query({
  args: {
    userId: v.id("users"),
    workerProfileId: v.id("workerProfiles"),
  },
  handler: async (ctx, args) => {
    const sessionUser = await getSessionUser(ctx, args.userId);
    const db: any = ctx.db;
    const profile = await db.get(args.workerProfileId);
    if (!profile) throw new Error("Worker profile not found");

    const isSelf = sessionUser._id === profile.userId;
    const isOwnerInCompany = sessionUser.role === "owner" && sessionUser.companyId === profile.companyId;
    if (!isSelf && !isOwnerInCompany) throw new Error("Access denied");

    return await db
      .query("workerOnboardingItems")
      .withIndex("by_workerProfileId", (q: any) => q.eq("workerProfileId", args.workerProfileId))
      .collect();
  },
});

export const listCompanyUsersMissingWorkerProfiles = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const owner = await assertOwnerRole(ctx, args.userId);
    const users = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", owner.companyId))
      .collect();

    const workerUsers = users.filter((u) => workerRoleValues.includes(u.role as any));
    const missing = [];
    for (const user of workerUsers) {
      const profile = await getProfileForUser(ctx, user._id);
      if (!profile) missing.push(user);
    }
    return missing.map((user) => ({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
    }));
  },
});
