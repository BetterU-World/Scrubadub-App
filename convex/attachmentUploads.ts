import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { attachmentTarget, attachmentTargetKey, authorizeAttachment } from "./lib/attachmentUploads";
import { requireActiveSubscription } from "./lib/subscriptionGating";

/** Follows Resource upload intents: a fresh unpredictable nonce in immutable storage metadata. */
export const begin = mutation({
  args: { sessionToken: v.string(), target: attachmentTarget, mimeType: v.string() },
  returns: v.object({ intentId: v.id("attachmentUploadIntents"), uploadUrl: v.string(), contentType: v.string(), expiresAt: v.number() }),
  handler: async (ctx, args) => {
    const user = await authorizeAttachment(ctx, args.sessionToken, args.target);
    if (!user.companyId) throw new Error("Company access required");
    await requireActiveSubscription(ctx, user.companyId);
    const allowed = args.target.kind === "onboardingPdf" ? ["application/pdf"] : ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(args.mimeType)) throw new Error("Unsupported attachment type");
    const nonce = crypto.randomUUID();
    const createdAt = Date.now();
    const expiresAt = createdAt + 60 * 60 * 1000;
    const intentId = await ctx.db.insert("attachmentUploadIntents", {
      userId: user._id, companyId: user.companyId, targetKey: attachmentTargetKey(args.target),
      nonce, mimeType: args.mimeType, status: "pending", createdAt, expiresAt,
    });
    return { intentId, uploadUrl: await ctx.storage.generateUploadUrl(), contentType: `${args.mimeType}; scrub-attachment=${nonce}`, expiresAt };
  },
});
