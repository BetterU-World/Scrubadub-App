import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { onboardingFor, ownerGoal, ownerOnboardingPreferences } from "./lib/ownerOnboarding";
import { requireOwnerSession } from "./lib/sessionAuth";

const sessionArgs = { sessionToken: v.string(), companyId: v.id("companies") };
const scheduledStatuses = ["scheduled", "confirmed", "in_progress", "submitted", "approved", "rework_requested"] as const;

export const preferences = query({
  args: sessionArgs,
  returns: ownerOnboardingPreferences,
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken);
    if (owner.companyId !== args.companyId) throw new Error("Access denied");
    return onboardingFor(owner);
  },
});

export const updatePreferences = mutation({
  args: {
    ...sessionArgs,
    change: v.union(
      v.object({ kind: v.literal("skipWelcome") }),
      v.object({ kind: v.literal("dismissAnnouncement") }),
      v.object({ kind: v.literal("setGoal"), goal: ownerGoal }),
      v.object({ kind: v.literal("dismissDashboard") }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken);
    if (owner.companyId !== args.companyId) throw new Error("Access denied");
    const previous = onboardingFor(owner);
    const next = { ...previous };

    switch (args.change.kind) {
      case "skipWelcome":
        if (next.cohort !== "signup") return null;
        next.welcomeHandled = true;
        break;
      case "dismissAnnouncement":
        if (next.cohort !== "existing") return null;
        next.announcementDismissed = true;
        break;
      case "setGoal":
        next.goal = args.change.goal;
        if (next.cohort === "signup") next.welcomeHandled = true;
        break;
      case "dismissDashboard":
        next.dashboardDismissed = true;
        break;
    }

    if (next.goal !== previous.goal || next.welcomeHandled !== previous.welcomeHandled ||
        next.announcementDismissed !== previous.announcementDismissed ||
        next.dashboardDismissed !== previous.dashboardDismissed) {
      await ctx.db.patch(owner._id, { ownerOnboarding: next });
    }
    return null;
  },
});

export const progress = query({
  args: sessionArgs,
  returns: v.object({
    jobId: v.union(v.id("jobs"), v.null()),
    propertyId: v.union(v.id("properties"), v.null()),
    cleaner: v.union(v.literal("joined"), v.literal("active"), v.null()),
    invitation: v.union(v.object({ expiresAt: v.number(), emailSent: v.boolean() }), v.null()),
  }),
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken);
    const companyId = owner.companyId;
    if (companyId !== args.companyId) throw new Error("Access denied");

    const [property, joinedCleaner, legacyCleaner, pendingInvite, jobs] = await Promise.all([
      ctx.db.query("properties").withIndex("by_companyId_active", (q) =>
        q.eq("companyId", companyId).eq("active", true)).order("desc").first(),
      ctx.db.query("users").withIndex("by_companyId_role_status_invitationStatus", (q) =>
        q.eq("companyId", companyId).eq("role", "cleaner").eq("status", "active").eq("invitationStatus", "accepted")).first(),
      ctx.db.query("users").withIndex("by_companyId_role_status_invitationStatus", (q) =>
        q.eq("companyId", companyId).eq("role", "cleaner").eq("status", "active").eq("invitationStatus", undefined)).first(),
      ctx.db.query("users").withIndex("by_companyId_role_status_inviteTokenExpiry", (q) =>
        q.eq("companyId", companyId).eq("role", "cleaner").eq("status", "pending").gt("inviteTokenExpiry", undefined))
        .order("desc").first(),
      Promise.all(scheduledStatuses.flatMap((status) => [
        ctx.db.query("jobs").withIndex("by_companyId_status_type", (q) =>
          q.eq("companyId", companyId).eq("status", status).lt("type", "maintenance")).order("desc").first(),
        ctx.db.query("jobs").withIndex("by_companyId_status_type", (q) =>
          q.eq("companyId", companyId).eq("status", status).gt("type", "maintenance")).order("desc").first(),
      ])),
    ]);

    const job = jobs.reduce<(typeof jobs)[number]>((latest, candidate) =>
      candidate && (!latest || candidate._creationTime > latest._creationTime) ? candidate : latest, null);

    return {
      jobId: job?._id ?? null,
      propertyId: property?._id ?? null,
      cleaner: joinedCleaner ? "joined" as const : legacyCleaner ? "active" as const : null,
      invitation: pendingInvite?.inviteTokenExpiry && pendingInvite.invitationStatus !== "revoked"
        ? { expiresAt: pendingInvite.inviteTokenExpiry, emailSent: pendingInvite.cleanerInviteEmailSentAt !== undefined }
        : null,
    };
  },
});

export const recordCleanerInviteEmailSent = internalMutation({
  args: { tokenHash: v.string() },
  returns: v.null(),
  handler: async (ctx, { tokenHash }) => {
    const invitee = await ctx.db.query("users").withIndex("by_inviteTokenHash", (q) =>
      q.eq("inviteTokenHash", tokenHash)).first();
    if (invitee?.role === "cleaner" && invitee.status === "pending" &&
        invitee.invitationStatus !== "revoked" && invitee.cleanerInviteEmailSentAt === undefined) {
      await ctx.db.patch(invitee._id, { cleanerInviteEmailSentAt: Date.now() });
    }
    return null;
  },
});
