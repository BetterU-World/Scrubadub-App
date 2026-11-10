import { internalMutation, internalQuery } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import schema from "./schema";
import { workerProfileAllowsStaffAccess } from "./lib/workerProfileAccess";
import { revokeAllSessionsForPrincipal } from "./lib/sessionRevocation";
import { hasPlatformAdmin as adminEntitlement } from "./lib/platformEntitlements";

export const hasPlatformAdmin = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => adminEntitlement(ctx, args.userId),
});

const sessionPrincipal = v.union(
  v.object({ principalType: v.literal("staff"), userId: v.id("users") }),
  v.object({ principalType: v.literal("client"), clientUserId: v.id("clientUsers") })
);

export const create = internalMutation({
  args: {
    principal: sessionPrincipal,
    tokenHash: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    idleExpiresAt: v.number(),
    deviceLabel: v.optional(v.string()),
  },
  returns: v.id("authSessions"),
  handler: async (ctx, args) => {
    // The check and insert share a transaction, including absence/duplicate reads.
    // A concurrent profile disable either wins first or revokes this new session.
    if (args.principal.principalType === "staff") {
      const user = await ctx.db.get(args.principal.userId);
      if (!user || user.status !== "active" || !await workerProfileAllowsStaffAccess(ctx, user)) {
        throw new ConvexError({ code: "INVALID_CREDENTIALS", message: "Invalid email or password" });
      }
    }
    return await ctx.db.insert("authSessions", {
      ...args.principal,
      tokenHash: args.tokenHash,
      version: 1,
      createdAt: args.createdAt,
      lastUsedAt: args.createdAt,
      expiresAt: args.expiresAt,
      idleExpiresAt: args.idleExpiresAt,
      deviceLabel: args.deviceLabel,
    });
  },
});

export const getByTokenHash = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("authSessions")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique(),
});

export const getStaffPrincipal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(v.null(), v.object({ ...schema.tables.users.validator.fields,
    _id: v.id("users"), _creationTime: v.number() })),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    return user && await workerProfileAllowsStaffAccess(ctx, user) ? user : null;
  },
});

export const getClientPrincipal = internalQuery({
  args: { clientUserId: v.id("clientUsers") },
  handler: async (ctx, args) => await ctx.db.get(args.clientUserId),
});

export const touch = internalMutation({
  args: {
    sessionId: v.id("authSessions"),
    expectedLastUsedAt: v.number(),
    now: v.number(),
    idleExpiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= args.now ||
      session.idleExpiresAt <= args.now ||
      session.lastUsedAt !== args.expectedLastUsedAt
    ) {
      return false;
    }
    await ctx.db.patch(args.sessionId, {
      lastUsedAt: args.now,
      idleExpiresAt: Math.min(args.idleExpiresAt, session.expiresAt),
    });
    return true;
  },
});

export const revoke = internalMutation({
  args: {
    sessionId: v.id("authSessions"),
    now: v.number(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.revokedAt) return false;
    await ctx.db.patch(args.sessionId, {
      revokedAt: args.now,
      revokedReason: args.reason,
    });
    return true;
  },
});

export const revokeAllForPrincipal = internalMutation({
  args: {
    principal: sessionPrincipal,
    now: v.number(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => revokeAllSessionsForPrincipal(ctx, args.principal, args.now, args.reason),
});
