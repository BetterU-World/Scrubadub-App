"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import {
  sendJobAssignedEmail,
  sendJobCompletedEmail,
  sendJobApprovedEmail,
  sendStripeConnectInviteEmail,
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
