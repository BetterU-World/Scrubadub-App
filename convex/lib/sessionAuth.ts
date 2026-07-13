import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { isFounderEmail } from "./founderEmails";
import {
  SESSION_IDLE_EXPIRY_MS,
  SESSION_REQUIRED_ERROR,
  SESSION_TOUCH_INTERVAL_MS,
} from "./sessionConstants";

declare const process: { env: Record<string, string | undefined> };

type DbCtx = QueryCtx | MutationCtx;
type ActiveStaff = Doc<"users"> & { status: "active" };
type ActiveCompanyStaff = ActiveStaff & { companyId: Id<"companies"> };
export type ActiveClient = Doc<"clientUsers"> & { status: "active" };
type ActiveOwner = ActiveStaff & { role: "owner"; companyId: Id<"companies"> };
export type ActiveWorker = ActiveStaff & {
  role: "cleaner" | "maintenance" | "manager";
  companyId: Id<"companies">;
};
export type ActiveOwnerManager = ActiveStaff & {
  role: "owner" | "manager";
  companyId: Id<"companies">;
};

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

/** Resolve any active staff caller and enforce same-company access. */
export async function requireStaffCompany(
  ctx: DbCtx,
  sessionToken: string,
  companyId: Id<"companies">,
  claimedUserId?: Id<"users">
): Promise<ActiveCompanyStaff> {
  const user = await requireVerifiedStaffSession(ctx, sessionToken, claimedUserId);
  if (!user.companyId || user.companyId !== companyId) throw new Error("Access denied");
  return user as ActiveCompanyStaff;
}

export async function requireVerifiedClientSession(
  ctx: DbCtx,
  sessionToken: string,
  claimedClientUserId?: Id<"clientUsers">
): Promise<ActiveClient> {
  if (!sessionToken || sessionToken.length > 256) throw new Error(SESSION_REQUIRED_ERROR);
  const now = Date.now();
  const tokenHash = await hashSessionToken(sessionToken);
  const verifiedSession = await ctx.db
    .query("authSessions")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  if (
    !verifiedSession ||
    verifiedSession.principalType !== "client" ||
    verifiedSession.revokedAt ||
    verifiedSession.expiresAt <= now ||
    verifiedSession.idleExpiresAt <= now
  ) {
    throw new Error(SESSION_REQUIRED_ERROR);
  }
  const clientUser = await ctx.db.get(verifiedSession.clientUserId);
  if (!clientUser || clientUser.status !== "active") throw new Error(SESSION_REQUIRED_ERROR);
  if (claimedClientUserId && claimedClientUserId !== clientUser._id) {
    console.warn("[security] client session principal mismatch rejected");
    throw new Error("Session principal does not match the requested client");
  }
  if ("patch" in ctx.db && now - verifiedSession.lastUsedAt >= SESSION_TOUCH_INTERVAL_MS) {
    await ctx.db.patch(verifiedSession._id, {
      lastUsedAt: now,
      idleExpiresAt: Math.min(now + SESSION_IDLE_EXPIRY_MS, verifiedSession.expiresAt),
    });
  }
  return clientUser as ActiveClient;
}

export async function requireActiveClientRelationship(
  ctx: DbCtx,
  clientUser: ActiveClient,
  relationshipId: Id<"clientRelationships">
) {
  const relationship = await ctx.db.get(relationshipId);
  if (
    !relationship ||
    relationship.clientUserId !== clientUser._id ||
    relationship.status !== "active"
  ) {
    throw new Error("Client relationship access required");
  }
  return relationship;
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

export async function requireWorkerSession(
  ctx: DbCtx,
  sessionToken: string,
  claimedUserId?: Id<"users">
): Promise<ActiveWorker> {
  const user = await requireVerifiedStaffSession(ctx, sessionToken, claimedUserId);
  if (
    (user.role !== "cleaner" && user.role !== "maintenance" && user.role !== "manager") ||
    !user.companyId
  ) {
    throw new Error("Worker session required");
  }
  return user as ActiveWorker;
}

export async function requireWorkerCompany(
  ctx: DbCtx,
  sessionToken: string,
  companyId: Id<"companies">,
  claimedUserId?: Id<"users">
): Promise<ActiveWorker> {
  const user = await requireWorkerSession(ctx, sessionToken, claimedUserId);
  if (user.companyId !== companyId) throw new Error("Access denied");
  return user;
}

export async function requireActiveWorkerProfile(
  ctx: DbCtx,
  sessionToken: string,
  claimedUserId?: Id<"users">
) {
  const user = await requireWorkerSession(ctx, sessionToken, claimedUserId);
  const profile = await ctx.db
    .query("workerProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .first();
  if (!profile || profile.workerStatus !== "active") {
    throw new Error("Active worker profile required");
  }
  return { user, profile };
}

/**
 * Resolve caller identity for ordinary owner and manager application workflows.
 * The optional claimed ID is checked only for migration safety and never selects
 * or overrides the authenticated principal.
 */
export async function requireOwnerManagerSession(
  ctx: DbCtx,
  sessionToken: string,
  claimedUserId?: Id<"users">
): Promise<ActiveOwnerManager> {
  const user = await requireVerifiedStaffSession(ctx, sessionToken, claimedUserId);
  if ((user.role !== "owner" && user.role !== "manager") || !user.companyId) {
    throw new Error("Owner or manager session required");
  }
  return user as ActiveOwnerManager;
}

export async function requireOwnerManagerCompany(
  ctx: DbCtx,
  sessionToken: string,
  companyId: Id<"companies">,
  claimedUserId?: Id<"users">
): Promise<ActiveOwnerManager> {
  const user = await requireOwnerManagerSession(ctx, sessionToken, claimedUserId);
  if (user.companyId !== companyId) throw new Error("Access denied");
  return user;
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
  if (!isFounderEmail(user.email)) throw new Error("Super admin session required");
  console.info("[security] verified founder allowlist access", { userId: String(user._id) });
  return user;
}
