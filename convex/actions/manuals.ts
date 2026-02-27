"use node";

declare const process: { env: Record<string, string | undefined> };

import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { get } from "@vercel/blob";

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

    // Normalize blobKey: get() accepts a full URL or pathname.
    // If stored as a full URL, extract the pathname for the SDK.
    let blobRef = manual.blobKey;
    try {
      const parsed = new URL(blobRef);
      if (parsed.hostname.endsWith(".blob.vercel-storage.com")) {
        blobRef = parsed.pathname.replace(/^\//, "");
      }
    } catch {
      // Already a pathname — use as-is
    }

    // Fetch private blob content (authenticated via token)
    const result = await get(blobRef, { access: "private", token });
    if (!result || result.statusCode !== 200 || !result.stream) {
      throw new Error("Blob not found or not accessible");
    }

    // Convert stream to Blob with correct content type
    const contentType = result.blob.contentType ?? "application/pdf";
    const response = new Response(result.stream, {
      headers: { "Content-Type": contentType },
    });
    const pdfBlob = await response.blob();

    // Proxy through Convex storage to get a short-lived public URL
    const storageId = await ctx.storage.store(pdfBlob);
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("Failed to generate download URL");

    return { url };
  },
});
