import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

export const getManualSignedUrl = action({
  args: { userId: v.id("users"), manualId: v.id("manuals") },
  handler: async (ctx, args) => {
    const manual = await ctx.runQuery(
      internal.queries.manuals.validateManualAccess,
      { userId: args.userId, manualId: args.manualId }
    );

    // ── TODO: Vercel Blob signed URL integration ──────────────────
    // Replace the stub below with:
    //
    //   import { getDownloadUrl } from "@vercel/blob";
    //   const { url } = await getDownloadUrl(manual.blobKey, {
    //     expiresIn: 60 * 5, // 5 minutes
    //   });
    //   return { url };
    //
    // Prerequisites:
    //   1. npm install @vercel/blob (in the convex package or root)
    //   2. Set BLOB_READ_WRITE_TOKEN env var in Convex dashboard
    //   3. Manuals uploaded to Vercel Blob; blobKey = the blob pathname
    // ──────────────────────────────────────────────────────────────

    const url = `#stub:blob-signing-not-configured:${manual.blobKey}`;
    return { url };
  },
});
