"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { completionContext, approvalContext } from "../lib/jobReviewEmailContext";
import {
  sendPasswordResetEmail,
  sendClientPasswordResetEmail,
  sendInviteEmail,
  sendAffiliateInviteEmail,
  sendPartnerInviteEmail,
  sendPartnerSharedJobEmail,
  sendClientInviteEmail,
} from "../lib/email";

/**
 * Internal action: send "job assigned" email to a cleaner.
 * Scheduled from mutations via ctx.scheduler.runAfter(0, ...).
 */
export const sendJobAssigned = internalAction({
  returns: v.null(),
  args: {
    deliveryId: v.optional(v.id("operationalEmailDeliveries")),
    assignmentContext: v.optional(v.object({ jobId: v.id("jobs"), workerId: v.id("users"), revision: v.number() })),
    email: v.string(),
    propertyName: v.string(),
    scheduledDate: v.string(),
    startTime: v.optional(v.string()),
    companyName: v.string(),
    replyTo: v.optional(v.string()),
  },
  handler: async (ctx, queued) => {
    const deliveryId = queued.deliveryId ?? (queued.assignmentContext
      ? await ctx.runMutation(internal.operationalEmailDelivery.adoptQueued, { event: { kind: "assignment",
        jobId: queued.assignmentContext.jobId, recipientId: queued.assignmentContext.workerId, revision: queued.assignmentContext.revision } })
      : null);
    if (deliveryId) {
      await ctx.runAction(internal.operationalEmailActions.dispatch, { deliveryId });
      return null;
    }
    if (queued.assignmentContext) return null;
    // An email address alone cannot prove current worker/profile authorization.
    // Suppress unidentified legacy work invitations; do not guess tenant identity
    // or synthesize/rewrite delivery ledger records.
    return null;
  },
});

/**
 * Internal action: send "job completed" email to the owner.
 * Scheduled from mutations via ctx.scheduler.runAfter(0, ...).
 */
export const sendJobCompleted = internalAction({
  returns: v.null(),
  args: {
    deliveryId: v.optional(v.id("operationalEmailDeliveries")),
    completionContext: v.optional(completionContext),
    email: v.string(),
    propertyName: v.string(),
    cleanerName: v.string(),
    completedAt: v.number(),
    companyName: v.string(),
    replyTo: v.optional(v.string()),
  },
  handler: async (ctx, queued) => {
    // Legacy payloads have no trustworthy job/recipient identity. Accept but skip.
    const deliveryId = queued.deliveryId ?? (queued.completionContext
      ? await ctx.runMutation(internal.operationalEmailDelivery.adoptQueued,
        { event: { kind: "completion", ...queued.completionContext } }) : null);
    if (deliveryId) await ctx.runAction(internal.operationalEmailActions.dispatch, { deliveryId });
    return null;
  },
});

/**
 * Internal action: send "job approved" email to a cleaner.
 * Scheduled from mutations via ctx.scheduler.runAfter(0, ...).
 */
export const sendJobApproved = internalAction({
  returns: v.null(),
  args: {
    deliveryId: v.optional(v.id("operationalEmailDeliveries")),
    approvalContext: v.optional(approvalContext),
    email: v.string(),
    propertyName: v.string(),
    companyName: v.string(),
    replyTo: v.optional(v.string()),
  },
  handler: async (ctx, queued) => {
    const deliveryId = queued.deliveryId ?? (queued.approvalContext
      ? await ctx.runMutation(internal.operationalEmailDelivery.adoptQueued,
        { event: { kind: "approval", ...queued.approvalContext } }) : null);
    if (deliveryId) await ctx.runAction(internal.operationalEmailActions.dispatch, { deliveryId });
    return null;
  },
});

/**
 * Internal action: send "connect Stripe" invite email to a cleaner.
 * Scheduled from mutations via ctx.scheduler.runAfter(0, ...).
 */
export const sendStripeConnectInvite = internalAction({
  args: {
    email: v.string(),
    ownerName: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    // Do not promote the retired worker payment rail, including previously queued invites.
    return;
  },
});

/**
 * Internal action: send password reset email.
 * Scheduled from mutations via ctx.scheduler.runAfter(0, ...).
 */
export const sendPasswordReset = internalAction({
  args: {
    email: v.string(),
    token: v.string(),
  },
  handler: async (_ctx, args) => {
    const sent = await sendPasswordResetEmail(args.email, args.token);
    if (!sent) {
      console.error("[emailNotifications] Password reset email failed for", args.email);
    }
  },
});

export const sendClientPasswordReset = internalAction({
  args: { email: v.string(), token: v.string() },
  handler: async (_ctx, args) => {
    const sent = await sendClientPasswordResetEmail(args.email, args.token);
    if (!sent) console.error("[emailNotifications] Client password reset email failed");
  },
});

/**
 * Internal action: send affiliate program invite email.
 * Scheduled from mutations via ctx.scheduler.runAfter(0, ...).
 */
export const sendAffiliateInvite = internalAction({
  args: {
    email: v.string(),
    inviteToken: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const sent = await sendAffiliateInviteEmail(args.email, args.inviteToken, args.name);
    if (!sent) {
      console.error("[emailNotifications] Affiliate invite email failed for", args.email);
    }
  },
});

/**
 * Internal action: send partner connection invite email.
 * Scheduled from mutations via ctx.scheduler.runAfter(0, ...).
 */
export const sendPartnerInvite = internalAction({
  args: {
    email: v.string(),
    fromCompanyName: v.string(),
    replyTo: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const sent = await sendPartnerInviteEmail(args.email, args.fromCompanyName, args.replyTo);
    if (!sent) {
      console.error("[emailNotifications] Partner invite email failed for", args.email);
    }
  },
});

export const sendPartnerSharedJob = internalAction({
  args: {
    email: v.string(),
    fromCompanyName: v.string(),
    toCompanyName: v.string(),
    propertyName: v.string(),
    serviceType: v.string(),
    scheduledDate: v.string(),
    startTime: v.optional(v.string()),
    durationMinutes: v.number(),
    notes: v.optional(v.string()),
    copiedJobId: v.id("jobs"),
    timezone: v.string(),
    language: v.optional(v.union(v.literal("en"), v.literal("es"))),
    replyTo: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const sent = await sendPartnerSharedJobEmail(args);
    if (!sent) {
      console.error("[emailNotifications] Partner shared-job email failed for recipient");
    }
  },
});

export const sendInvite = internalAction({
  args: {
    email: v.string(),
    inviteToken: v.string(),
  },
  handler: async (_ctx, args) => {
    const sent = await sendInviteEmail(args.email, args.inviteToken);
    if (!sent) {
      console.error("[emailNotifications] Invite email failed for", args.email);
    }
  },
});

export const sendClientInvite = internalAction({
  args: {
    email: v.string(),
    token: v.string(),
    name: v.optional(v.string()),
    companyName: v.string(),
    replyTo: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const sent = await sendClientInviteEmail(args.email, args.token, args.name, {
      companyName: args.companyName,
      replyTo: args.replyTo,
    });
    if (!sent) {
      console.error("[emailNotifications] Client invite email failed for", args.email);
    }
  },
});
