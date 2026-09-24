import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";
import { validateResourceParts, validateResourceSize } from "./lib/companyResources";

async function readExactRange(url: string, start: number, end: number, total: number) {
  const response = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
  if (response.status !== 206 || response.headers.get("Content-Range") !== `bytes ${start}-${end}/${total}`) throw new Error("Stored file range unavailable");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length !== end - start + 1) throw new Error("Stored file range changed");
  return bytes;
}

export const finalize = action({
  args: { sessionToken: v.string(), intentId: v.id("resourceUploadIntents"), storageId: v.id("_storage") },
  handler: async (ctx, args): Promise<{ resourceId: string; reused: boolean }> => {
    try {
      const check: any = await ctx.runQuery((internal as any).mutations.resourceUploadIntents.inspect, args);
      const { intent, stored } = check;
      if (intent.status === "completed" && intent.completedResourceId) return { resourceId: intent.completedResourceId, reused: true };
      if (!stored || intent.candidateStorageId !== args.storageId) throw new Error("Candidate must be registered");
      validateResourceSize(stored.size);
      const url = await ctx.storage.getUrl(args.storageId);
      if (!url) throw new Error("Stored file unavailable");
      const head = await readExactRange(url, 0, Math.min(stored.size - 1, 63), stored.size);
      const tailStart = Math.max(0, stored.size - 2048);
      const tail = await readExactRange(url, tailStart, stored.size - 1, stored.size);
      const metadata = validateResourceParts(head, tail, stored.size, intent.declaredMimeType, intent.originalFileName);
      return await ctx.runMutation((internal as any).mutations.companyResources.finalizeUpload, {
        sessionToken: args.sessionToken, intentId: args.intentId, requestId: intent.requestId,
        resourceId: intent.resourceId, expectedStorageId: intent.expectedStorageId,
        storageId: args.storageId, title: intent.title, description: intent.description, ...metadata,
      });
    } catch (error) {
      try { await ctx.runMutation((api as any).mutations.resourceUploadIntents.cancel, { sessionToken: args.sessionToken, intentId: args.intentId, storageId: args.storageId }); }
      catch (cleanupError) { console.error("[resources] candidate cleanup deferred to expiry", { intentId: args.intentId, cleanupError }); }
      throw error;
    }
  },
});
