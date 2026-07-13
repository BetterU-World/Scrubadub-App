"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import {
  sendJobAssignedEmail,
  sendJobCompletedEmail,
  sendJobApprovedEmail,
  sendStripeConnectInviteEmail,
  sendPasswordResetEmail,
  sendClientPasswordResetEmail,
  sendInviteEmail,
  sendAffiliateInviteEmail,
  sendPartnerInviteEmail,
  sendClientInviteEmail,
} from "../lib/email";

/**
 * Internal action: send "job assigned" email to a cleaner.
 * Scheduled from mutations via ctx.scheduler.runAfter(0, ...).
 */
export const sendJobAssigned = internalAction({
  args: {
    email: v.string(),
    propertyName: v.string(),
    scheduledDate: v.string(),
    startTime: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const sent = await sendJobAssignedEmail(
      args.email,
      args.propertyName,
      args.scheduledDate,
      args.startTime
    );
    if (!sent) {
      console.error("[emailNotifications] Job assigned email failed for", args.email);
    }
  },
});

/**
 * Internal action: send "job completed" email to the owner.
 * Scheduled from mutations via ctx.scheduler.runAfter(0, ...).
 */
export const sendJobCompleted = internalAction({
  args: {
    email: v.string(),
    propertyName: v.string(),
    cleanerName: v.string(),
    completedAt: v.number(),
  },
  handler: async (_ctx, args) => {
    const sent = await sendJobCompletedEmail(
      args.email,
      args.propertyName,
      args.cleanerName,
      args.completedAt
    );
    if (!sent) {
      console.error("[emailNotifications] Job completed email failed for", args.email);
    }
  },
});

/**
 * Internal action: send "job approved" email to a cleaner.
 * Scheduled from mutations via ctx.scheduler.runAfter(0, ...).
 */
export const sendJobApproved = internalAction({
  args: {
    email: v.string(),
    propertyName: v.string(),
  },
  handler: async (_ctx, args) => {
    const sent = await sendJobApprovedEmail(args.email, args.propertyName);
    if (!sent) {
      console.error("[emailNotifications] Job approved email failed for", args.email);
    }
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
    const sent = await sendStripeConnectInviteEmail(args.email, args.ownerName);
    if (!sent) {
      console.error("[emailNotifications] Stripe connect invite email failed for", args.email);
    }
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
  },
  handler: async (_ctx, args) => {
    const sent = await sendPartnerInviteEmail(args.email, args.fromCompanyName);
    if (!sent) {
      console.error("[emailNotifications] Partner invite email failed for", args.email);
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
  },
  handler: async (_ctx, args) => {
    const sent = await sendClientInviteEmail(args.email, args.token, args.name);
    if (!sent) {
      console.error("[emailNotifications] Client invite email failed for", args.email);
    }
  },
});
