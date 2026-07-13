"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  getPrincipalFromSessionToken,
  requireClientSession,
  requireStaffSession,
} from "./lib/sessions";
import { recordSecurityEventFromAction } from "./lib/securityEventActions";

const sessionApi: any = (internal as any).sessionInternal;

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
    await recordSecurityEventFromAction(ctx, {
      eventType: "session_logout",
      principalType: principal.kind === "staff" ? "staff" : "client",
      staffUserId: principal.kind === "staff" ? principal.userId : undefined,
      clientUserId: principal.kind === "client" ? principal.clientUserId : undefined,
      outcome: "success",
    });
    return { revoked: true };
  },
});

export const revokeAllStaffSessions = action({
  args: { sessionToken: v.string() },
  handler: async (ctx, args): Promise<{ revoked: number }> => {
    const principal = await requireStaffSession(ctx, args.sessionToken);
    const revoked: number = await ctx.runMutation(sessionApi.revokeAllForPrincipal, {
      principal: { principalType: "staff", userId: principal.userId },
      now: Date.now(),
      reason: "revoke_all",
    });
    await recordSecurityEventFromAction(ctx, { eventType: "sessions_revoked", principalType: "staff", staffUserId: principal.userId, companyId: principal.companyId, outcome: "success", metadata: { reason: "revoke_all" } });
    return { revoked };
  },
});

export const revokeAllClientSessions = action({
  args: { sessionToken: v.string() },
  handler: async (ctx, args): Promise<{ revoked: number }> => {
    const principal = await requireClientSession(ctx, args.sessionToken);
    const revoked: number = await ctx.runMutation(sessionApi.revokeAllForPrincipal, {
      principal: { principalType: "client", clientUserId: principal.clientUserId },
      now: Date.now(),
      reason: "revoke_all",
    });
    await recordSecurityEventFromAction(ctx, { eventType: "sessions_revoked", principalType: "client", clientUserId: principal.clientUserId, outcome: "success", metadata: { reason: "revoke_all" } });
    return { revoked };
  },
});
