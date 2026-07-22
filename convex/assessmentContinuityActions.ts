"use node";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { randomBytes } from "node:crypto";
import { sendAssessmentReportEmail } from "./lib/email";

export const requestReportLink = action({
  args: {
    attemptId: v.id("assessmentAttempts"),
    capability: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    businessName: v.optional(v.string()),
    language: v.union(v.literal("en"), v.literal("es")),
    marketingConsent: v.boolean(),
  },
  handler: async (ctx, args) => {
    const token = randomBytes(32).toString("hex");
    const prepared = await ctx.runMutation(
      internal.assessmentContinuity.prepareDelivery,
      { ...args, token },
    );
    let delivered = false;
    try {
      delivered = await sendAssessmentReportEmail({
        email: prepared.normalizedEmail,
        language: args.language,
        token,
        expiresAt: prepared.expiresAt,
      });
    } finally {
      await ctx.runMutation(internal.assessmentContinuity.finishDelivery, {
        prospectId: prepared.prospectId,
        delivered,
      });
    }
    if (!delivered)
      throw new Error(
        "We could not send the link. Your report remains available here.",
      );
    return { sent: true };
  },
});
