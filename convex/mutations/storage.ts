import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../lib/helpers";

export const generateUploadUrl = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);
    return await ctx.storage.generateUploadUrl();
  },
});

export const getUrl = mutation({
  args: { sessionToken: v.string(), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);
    return await ctx.storage.getUrl(args.storageId);
  },
});
