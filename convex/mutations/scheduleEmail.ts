import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

/**
 * Thin internal mutations that schedule email actions via ctx.scheduler.
 * Actions (which lack ctx.scheduler) call these to send emails asynchronously.
 */

export const schedulePasswordResetEmail = internalMutation({
  args: { email: v.string(), token: v.string() },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, internal.actions.emailNotifications.sendPasswordReset, {
      email: args.email,
      token: args.token,
    });
  },
});

export const scheduleAffiliateInviteEmail = internalMutation({
  args: { email: v.string(), inviteToken: v.string(), name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, internal.actions.emailNotifications.sendAffiliateInvite, {
      email: args.email,
      inviteToken: args.inviteToken,
      name: args.name,
    });
  },
});

export const scheduleInviteEmail = internalMutation({
  args: { email: v.string(), inviteToken: v.string() },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, internal.actions.emailNotifications.sendInvite, {
      email: args.email,
      inviteToken: args.inviteToken,
    });
  },
});
