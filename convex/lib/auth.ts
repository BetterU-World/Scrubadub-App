import { QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Central auth helper. Resolves the session user via:
 *  1. Convex auth identity (preferred, when proper auth provider is configured)
 *  2. Explicit userId parameter (current client-side auth fallback)
 *
 * Returns the full user document or throws.
 */
export async function getSessionUser(
  ctx: QueryCtx,
  providedUserId?: Id<"users">
) {
  // Try Convex auth identity first (secure path)
  const identity = await ctx.auth.getUserIdentity();
  if (identity?.email) {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();
    if (user && user.status !== "inactive") return user;
  }

  // Fall back to provided userId (client-side auth)
  if (!providedUserId) {
    throw new Error("Authentication required");
  }
  const user = await ctx.db.get(providedUserId);
  if (!user) {
    throw new Error("Authentication required");
  }
  if (user.status === "inactive") {
    throw new Error("Account deactivated");
  }
  return user;
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
