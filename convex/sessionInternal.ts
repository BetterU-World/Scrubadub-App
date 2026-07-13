import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { revokeAllSessionsForPrincipal } from "./lib/sessionRevocation";

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
  handler: async (ctx, args) => {
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
  handler: async (ctx, args) => await ctx.db.get(args.userId),
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
