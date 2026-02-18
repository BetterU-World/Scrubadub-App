import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../lib/helpers";

export const getUrl = query({
  args: { sessionToken: v.string(), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);
    return await ctx.storage.getUrl(args.storageId);
  },
});
