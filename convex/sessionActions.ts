"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  getPrincipalFromSessionToken,
  requireClientSession,
  requireStaffSession,
} from "./lib/sessions";

const sessionApi = (internal as any).sessionInternal;

export const getPrincipal = action({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => await getPrincipalFromSessionToken(ctx, args.sessionToken),
});

export const getStaffPrincipal = action({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => await requireStaffSession(ctx, args.sessionToken),
});

export const getClientPrincipal = action({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => await requireClientSession(ctx, args.sessionToken),
});

export const revokeCurrent = action({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const principal = await getPrincipalFromSessionToken(ctx, args.sessionToken, { touch: false });
    await ctx.runMutation(sessionApi.revoke, {
      sessionId: principal.sessionId,
      now: Date.now(),
      reason: "logout",
    });
    return { revoked: true };
  },
});

export const revokeAllStaffSessions = action({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const principal = await requireStaffSession(ctx, args.sessionToken);
    const revoked = await ctx.runMutation(sessionApi.revokeAllForStaff, {
      userId: principal.userId,
      now: Date.now(),
      reason: "revoke_all",
    });
    return { revoked };
  },
});

export const revokeAllClientSessions = action({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const principal = await requireClientSession(ctx, args.sessionToken);
    const revoked = await ctx.runMutation(sessionApi.revokeAllForClient, {
      clientUserId: principal.clientUserId,
      now: Date.now(),
      reason: "revoke_all",
    });
    return { revoked };
  },
});
