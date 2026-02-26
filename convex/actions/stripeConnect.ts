"use node";

declare const process: { env: Record<string, string | undefined> };

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { getStripeClientOrNull } from "../lib/stripe";

/**
 * Quick check whether STRIPE_SECRET_KEY is configured.
 * Called once on component mount to drive the UI.
 */
export const isStripeConfigured = action({
  args: {},
  handler: async () => {
    return !!process.env.STRIPE_SECRET_KEY;
  },
});

/**
 * Start (or resume) Stripe Connect Express onboarding for an affiliate.
 * Creates the Connect account if needed, then returns an Account Link URL.
 */
export const startStripeConnectOnboarding = action({
  args: {
    userId: v.id("users"),
    returnTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const stripe = getStripeClientOrNull();
    if (!stripe) {
      return { ok: false as const, reason: "not_configured" };
    }

    // Fetch user via internal query (auth check)
    const user = await ctx.runQuery(
      internal.queries.stripeConnect.getUserForStripeConnect,
      { userId: args.userId }
    );
    if (!user) {
      return { ok: false as const, reason: "user_not_found" };
    }

    const appUrl =
      args.returnTo ||
      process.env.APP_URL ||
      "https://scrubadub-app-frontend.vercel.app";

    let accountId = user.stripeConnectAccountId;

    // Create a new Express account if none exists
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: user.email,
        metadata: { convexUserId: String(user._id) },
      });
      accountId = account.id;

      await ctx.runMutation(
        internal.mutations.stripeConnect.setStripeConnectAccount,
        { userId: args.userId, stripeConnectAccountId: accountId }
      );
    }

    // Create an Account Link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${appUrl}/affiliate/stripe/refresh`,
      return_url: `${appUrl}/affiliate/stripe/return`,
      type: "account_onboarding",
    });

    return { ok: true as const, url: accountLink.url };
  },
});

/**
 * Fetch the latest Stripe Connect account status and persist to DB.
 */
export const syncMyStripeConnectStatus = action({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const stripe = getStripeClientOrNull();
    if (!stripe) {
      return { ok: false as const, reason: "not_configured" };
    }

    const user = await ctx.runQuery(
      internal.queries.stripeConnect.getUserForStripeConnect,
      { userId: args.userId }
    );
    if (!user || !user.stripeConnectAccountId) {
      return { ok: false as const, reason: "no_account" };
    }

    const account = await stripe.accounts.retrieve(
      user.stripeConnectAccountId
    );

    const currentlyDue = account.requirements?.currently_due ?? [];
    const requirementsDue = currentlyDue.join(", ").slice(0, 500);

    const payoutsEnabled = account.payouts_enabled ?? false;
    const detailsSubmitted = account.details_submitted ?? false;

    const onboardingStatus =
      payoutsEnabled && detailsSubmitted && currentlyDue.length === 0
        ? ("complete" as const)
        : ("in_progress" as const);

    await ctx.runMutation(
      internal.mutations.stripeConnect.syncStripeConnectFields,
      {
        userId: args.userId,
        payoutsEnabled,
        detailsSubmitted,
        requirementsDue,
        onboardingStatus,
      }
    );

    return { ok: true as const };
  },
});
