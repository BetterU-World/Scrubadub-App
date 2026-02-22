import { QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Central auth helper. Resolves the session user via:
 *  1. Explicit userId parameter (current client-side auth)
 *  2. Convex auth identity (fallback, when auth provider is configured)
 *
 * Returns the full user document or throws.
 */
export async function getSessionUser(
  ctx: QueryCtx,
  providedUserId?: Id<"users">
) {
  // Prefer explicit userId when provided (client-side auth)
  if (providedUserId) {
    const user = await ctx.db.get(providedUserId);
    if (user && user.status !== "inactive") return user;
  }
  // Fall back to Convex auth identity (when auth provider is configured)
  const identity = await ctx.auth.getUserIdentity();
  if (identity?.email) {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();
    if (user && user.status !== "inactive") return user;
  }
  throw new Error("Authentication required");
}

/** Verify the session user belongs to the given company. */
export async function assertCompanyAccess(
  ctx: QueryCtx,
  providedUserId: Id<"users"> | undefined,
  companyId: Id<"companies">
) {
  const user = await getSessionUser(ctx, providedUserId);
  if (user.companyId !== companyId) {
    throw new Error("Access denied");
  }
  return user;
}

const SUPER_ADMIN_EMAILS = [
  "admin@scrubadub.com",
  "ceo@scrubadub.com",
];

export function isSuperAdminEmail(email: string): boolean {
  return SUPER_ADMIN_EMAILS.includes(email.toLowerCase());
}

/** Verify the session user is a super admin. */
export async function requireSuperAdmin(
  ctx: QueryCtx,
  providedUserId?: Id<"users">
) {
  const user = await getSessionUser(ctx, providedUserId);
  if (!isSuperAdminEmail(user.email)) {
    throw new Error("Super admin access required");
  }
  return user;
}

/** Verify the session user is an owner of their company. */
export async function assertOwnerRole(
  ctx: QueryCtx,
  providedUserId?: Id<"users">
) {
  const user = await getSessionUser(ctx, providedUserId);
  if (user.role !== "owner") {
    throw new Error("Owner access required");
  }
  return user;
}
