import { ConvexError } from "convex/values";
import { MutationCtx } from "../_generated/server";

/**
 * Sliding-window rate limiter backed by the `rateLimits` table.
 *
 * Call at the top of any mutation handler to enforce a per-key limit.
 * For actions (which lack ctx.db) use the internal mutation wrapper in
 * `convex/rateLimitInternal.ts` via ctx.runMutation().
 *
 * Best-effort under light concurrency — no distributed locks.
 */
export async function checkRateLimit(
  ctx: MutationCtx,
  { key, limit, windowMs }: { key: string; limit: number; windowMs: number },
): Promise<void> {
  const now = Date.now();

  const existing = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();

  // No record yet, or window has expired → start a fresh window
  if (!existing || now - existing.windowStartMs >= windowMs) {
    if (existing) {
      await ctx.db.patch(existing._id, { windowStartMs: now, count: 1 });
    } else {
      await ctx.db.insert("rateLimits", { key, windowStartMs: now, count: 1 });
    }
    return;
  }

  // Still inside the current window — increment
  const newCount = existing.count + 1;
  if (newCount > limit) {
    throw new ConvexError(
      "Rate limit exceeded. Please wait a moment before trying again.",
    );
  }

  await ctx.db.patch(existing._id, { count: newCount });
}
