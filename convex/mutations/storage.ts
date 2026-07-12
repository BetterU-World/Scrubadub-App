import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireVerifiedStaffSession } from "../lib/sessionAuth";
import { requireActiveSubscription } from "../lib/subscriptionGating";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export const generateUploadUrl = mutation({
  args: { userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireVerifiedStaffSession(ctx, args.sessionToken, args.userId);
    if (!user.companyId) throw new Error("Company access required");
    await requireActiveSubscription(ctx, user.companyId);
    return await ctx.storage.generateUploadUrl();
  },
});

export const getUrl = mutation({
  args: { storageId: v.id("_storage"), userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireVerifiedStaffSession(ctx, args.sessionToken, args.userId);
    return await ctx.storage.getUrl(args.storageId);
  },
});

export const validateUpload = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    mimeType: v.string(),
    size: v.number(),
    fileName: v.string(),
  },
  handler: async (ctx, args) => {
    await requireVerifiedStaffSession(ctx, args.sessionToken, args.userId);

    if (!ALLOWED_MIME_TYPES.has(args.mimeType)) {
      throw new Error(
        `File type not allowed. Accepted types: ${[...ALLOWED_MIME_TYPES].join(", ")}`
      );
    }

    if (args.size > MAX_FILE_SIZE_BYTES) {
      throw new Error(
        `File too large. Maximum size: ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`
      );
    }

    // Reject dangerous filenames
    const dangerous = /[<>:"/\\|?*\x00-\x1f]/;
    if (dangerous.test(args.fileName)) {
      throw new Error("Invalid filename");
    }

    return { valid: true };
  },
});
