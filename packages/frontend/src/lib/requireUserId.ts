import { Id } from "../../../../convex/_generated/dataModel";

/**
 * Returns the user's _id if auth is loaded, or null if still loading.
 * Use before calling protected mutations to avoid firing with undefined userId.
 */
export function requireUserId(
  user: { _id: Id<"users"> } | null | undefined
): Id<"users"> | null {
  return user?._id ?? null;
}
