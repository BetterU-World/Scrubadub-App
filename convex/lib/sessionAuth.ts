import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { isSuperAdminEmail } from "./auth";
import {
  SESSION_IDLE_EXPIRY_MS,
  SESSION_REQUIRED_ERROR,
  SESSION_TOUCH_INTERVAL_MS,
} from "./sessionConstants";

declare const process: { env: Record<string, string | undefined> };

type DbCtx = QueryCtx | MutationCtx;
type ActiveStaff = Doc<"users"> & { status: "active" };
type ActiveOwner = ActiveStaff & { role: "owner"; companyId: Id<"companies"> };

async function hashSessionToken(token: string) {
  const pepper = process.env.TOKEN_PEPPER;
  if (!pepper) throw new Error("Session verification is unavailable");
  const input = new TextEncoder().encode(token + pepper);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function requireVerifiedStaffSession(
  ctx: DbCtx,
  sessionToken: string,
  claimedUserId?: Id<"users">
): Promise<ActiveStaff> {
  if (!sessionToken || sessionToken.length > 256) {
    console.warn("[security] rejected legacy-only high-risk request");
    throw new Error(SESSION_REQUIRED_ERROR);
  }
  const now = Date.now();
  const tokenHash = await hashSessionToken(sessionToken);
  const verifiedSession = await ctx.db
    .query("authSessions")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  if (
    !verifiedSession ||
    verifiedSession.principalType !== "staff" ||
    verifiedSession.revokedAt ||
    verifiedSession.expiresAt <= now ||
    verifiedSession.idleExpiresAt <= now
  ) {
    throw new Error(SESSION_REQUIRED_ERROR);
  }
  const user = await ctx.db.get(verifiedSession.userId);
  if (!user || user.status !== "active") throw new Error(SESSION_REQUIRED_ERROR);
  if (claimedUserId && claimedUserId !== user._id) {
    console.warn("[security] session principal mismatch rejected");
    throw new Error("Session principal does not match the requested user");
  }
  if (
    "patch" in ctx.db &&
    now - verifiedSession.lastUsedAt >= SESSION_TOUCH_INTERVAL_MS
  ) {
    await ctx.db.patch(verifiedSession._id, {
      lastUsedAt: now,
      idleExpiresAt: Math.min(now + SESSION_IDLE_EXPIRY_MS, verifiedSession.expiresAt),
    });
  }
  return user as ActiveStaff;
}

export async function requireOwnerSession(
  ctx: DbCtx,
  sessionToken: string,
  claimedUserId?: Id<"users">
): Promise<ActiveOwner> {
  const user = await requireVerifiedStaffSession(ctx, sessionToken, claimedUserId);
  if (user.role !== "owner" || !user.companyId) throw new Error("Owner session required");
  return user as ActiveOwner;
}

export async function requireAffiliateSession(
  ctx: DbCtx,
  sessionToken: string,
  claimedUserId?: Id<"users">
) {
  const user = await requireVerifiedStaffSession(ctx, sessionToken, claimedUserId);
  if (user.role !== "affiliate") throw new Error("Affiliate session required");
  return user;
}

export async function requireSuperadminSession(
  ctx: DbCtx,
  sessionToken: string,
  claimedUserId?: Id<"users">
) {
  const user = await requireVerifiedStaffSession(ctx, sessionToken, claimedUserId);
  if (!isSuperAdminEmail(user.email)) throw new Error("Super admin session required");
  console.info("[security] verified founder allowlist access", { userId: String(user._id) });
  return user;
}
