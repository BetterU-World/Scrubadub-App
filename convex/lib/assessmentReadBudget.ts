import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const ASSESSMENT_READ_BUDGET = { limit: 30, windowMs: 10 * 60_000 };

/** Check before loading snapshots; charge only after capability verification.
 * One reusable row per attempt, shared by recovery/report/roadmap. Rejections
 * perform no writes. Convex OCC makes admission and charging transactional.
 */
export async function assessmentReadBudget(ctx: MutationCtx, attemptId: Id<"assessmentAttempts">) {
  const key = `assessment:read:${attemptId}`;
  const row = await ctx.db.query("rateLimits").withIndex("by_key", (q) => q.eq("key", key)).first();
  const now = Date.now();
  const reset = !row || now - row.windowStartMs >= ASSESSMENT_READ_BUDGET.windowMs;
  if (!reset && row.count >= ASSESSMENT_READ_BUDGET.limit) {
    throw new ConvexError("Assessment recovery rate limit exceeded. Please try again in a few minutes.");
  }
  return async () => {
    const values = { windowStartMs: reset ? now : row!.windowStartMs, count: reset ? 1 : row!.count + 1 };
    if (row) await ctx.db.patch(row._id, values);
    else await ctx.db.insert("rateLimits", { key, ...values });
  };
}
