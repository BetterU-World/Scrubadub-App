"use node";

declare const process: { env: Record<string, string | undefined> };

import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { head } from "@vercel/blob";

export const getManualSignedUrl = action({
  args: { userId: v.id("users"), manualId: v.id("manuals") },
  handler: async (ctx, args) => {
    const manual = await ctx.runQuery(
      internal.queries.manuals.validateManualAccess,
      { userId: args.userId, manualId: args.manualId }
    );

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      throw new Error(
        "BLOB_READ_WRITE_TOKEN is not configured. " +
          "Set it in the Convex dashboard under Environment Variables."
      );
    }

    // Verify the blob still exists and retrieve its download URL.
    // blobKey should be the full blob URL returned by put().
    // Note: Vercel Blob does not support native URL expiration;
    // access control is enforced server-side via validateManualAccess.
    const blob = await head(manual.blobKey, { token });
    return { url: blob.downloadUrl };
  },
});
