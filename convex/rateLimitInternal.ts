import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { checkRateLimit } from "./lib/rateLimit";

/**
 * Internal mutation so that actions (which lack ctx.db) can enforce
 * rate limits via ctx.runMutation().
 */
export const enforce = internalMutation({
  args: {
    key: v.string(),
    limit: v.number(),
    windowMs: v.number(),
  },
  handler: async (ctx, args) => {
    await checkRateLimit(ctx, args);
  },
});
