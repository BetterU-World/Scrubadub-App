"use node";

import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { generateSecureToken, hashToken } from "./tokens";
import { isFounderEmail } from "./founderEmails";
import {
  SESSION_ABSOLUTE_EXPIRY_MS,
  SESSION_IDLE_EXPIRY_MS,
  SESSION_REQUIRED_ERROR,
  SESSION_TOUCH_INTERVAL_MS,
} from "./sessionConstants";
export { SESSION_ABSOLUTE_EXPIRY_MS, SESSION_IDLE_EXPIRY_MS, SESSION_TOUCH_INTERVAL_MS };

type StaffBinding = { principalType: "staff"; userId: Id<"users"> };
type ClientBinding = { principalType: "client"; clientUserId: Id<"clientUsers"> };
export type SessionBinding = StaffBinding | ClientBinding;

export type StaffSessionPrincipal = {
  kind: "staff";
  sessionId: Id<"authSessions">;
  userId: Id<"users">;
  role: "owner" | "cleaner" | "maintenance" | "manager" | "affiliate";
  companyId?: Id<"companies">;
  status: "active";
};

export type ClientSessionPrincipal = {
  kind: "client";
  sessionId: Id<"authSessions">;
  clientUserId: Id<"clientUsers">;
  status: "active";
};

export type SessionPrincipal = StaffSessionPrincipal | ClientSessionPrincipal;

const sessionApi = (internal as any).sessionInternal;

export async function issueSession(
  ctx: ActionCtx,
  binding: SessionBinding,
  deviceLabel?: string
) {
  const now = Date.now();
  const sessionToken = generateSecureToken(32);
  const expiresAt = now + SESSION_ABSOLUTE_EXPIRY_MS;
  const idleExpiresAt = Math.min(now + SESSION_IDLE_EXPIRY_MS, expiresAt);
  await ctx.runMutation(sessionApi.create, {
    principal: binding,
    tokenHash: hashToken(sessionToken),
    createdAt: now,
    expiresAt,
    idleExpiresAt,
    deviceLabel: cleanDeviceLabel(deviceLabel),
  });
  return { sessionToken, sessionExpiresAt: expiresAt, sessionIdleExpiresAt: idleExpiresAt };
}

export async function getPrincipalFromSessionToken(
  ctx: ActionCtx,
  sessionToken: string,
  options: { touch?: boolean; now?: number } = {}
): Promise<SessionPrincipal> {
  if (!sessionToken || sessionToken.length > 256) throw new Error("Invalid session");
  const now = options.now ?? Date.now();
  const session = await ctx.runQuery(sessionApi.getByTokenHash, {
    tokenHash: hashToken(sessionToken),
  });
  if (!session || session.revokedAt || session.expiresAt <= now || session.idleExpiresAt <= now) {
    throw new Error("Invalid session");
  }

  let principal: SessionPrincipal;
  if (session.principalType === "staff") {
    const user = await ctx.runQuery(sessionApi.getStaffPrincipal, { userId: session.userId });
    if (!user || user.status !== "active") throw new Error("Invalid session");
    principal = {
      kind: "staff",
      sessionId: session._id,
      userId: user._id,
      role: user.role,
      companyId: user.companyId,
      status: "active",
    };
  } else {
    const clientUser = await ctx.runQuery(sessionApi.getClientPrincipal, {
      clientUserId: session.clientUserId,
    });
    if (!clientUser || clientUser.status !== "active") throw new Error("Invalid session");
    principal = {
      kind: "client",
      sessionId: session._id,
      clientUserId: clientUser._id,
      status: "active",
    };
  }

  if (options.touch !== false && now - session.lastUsedAt >= SESSION_TOUCH_INTERVAL_MS) {
    await ctx.runMutation(sessionApi.touch, {
      sessionId: session._id,
      expectedLastUsedAt: session.lastUsedAt,
      now,
      idleExpiresAt: now + SESSION_IDLE_EXPIRY_MS,
    });
  }
  return principal;
}

export async function requireStaffSession(
  ctx: ActionCtx,
  token: string,
  claimedUserId?: Id<"users">
): Promise<StaffSessionPrincipal> {
  if (!token) console.warn("[security] rejected legacy-only high-risk request");
  let principal: SessionPrincipal;
  try {
    principal = await getPrincipalFromSessionToken(ctx, token);
  } catch {
    throw new Error(SESSION_REQUIRED_ERROR);
  }
  if (principal.kind !== "staff") throw new Error("Staff session required");
  if (claimedUserId && claimedUserId !== principal.userId) {
    console.warn("[security] session principal mismatch rejected");
    throw new Error("Session principal does not match the requested user");
  }
  return principal;
}

export async function requireOwnerSession(
  ctx: ActionCtx,
  token: string,
  claimedUserId?: Id<"users">
): Promise<StaffSessionPrincipal & { role: "owner"; companyId: Id<"companies"> }> {
  const principal = await requireStaffSession(ctx, token, claimedUserId);
  if (principal.role !== "owner" || !principal.companyId) throw new Error("Owner session required");
  return principal as typeof principal & { role: "owner"; companyId: Id<"companies"> };
}

export async function requireAffiliateSession(
  ctx: ActionCtx,
  token: string,
  claimedUserId?: Id<"users">
): Promise<StaffSessionPrincipal> {
  const principal = await requireStaffSession(ctx, token, claimedUserId);
  if (principal.role !== "affiliate") throw new Error("Affiliate session required");
  return principal;
}

export async function requireSuperadminSession(
  ctx: ActionCtx,
  token: string,
  claimedUserId?: Id<"users">
): Promise<StaffSessionPrincipal> {
  const principal = await requireStaffSession(ctx, token, claimedUserId);
  const user = await ctx.runQuery(sessionApi.getStaffPrincipal, { userId: principal.userId });
  if (!user || !isFounderEmail(user.email)) throw new Error("Super admin session required");
  console.info("[security] verified founder allowlist access", { userId: String(principal.userId) });
  return principal;
}

export async function requireClientSession(ctx: ActionCtx, token: string) {
  const principal = await getPrincipalFromSessionToken(ctx, token);
  if (principal.kind !== "client") throw new Error("Client session required");
  return principal;
}

function cleanDeviceLabel(value: string | undefined) {
  const cleaned = value?.trim().slice(0, 100);
  return cleaned || undefined;
}
