"use node";

declare const process: { env: Record<string, string | undefined> };

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { getStripeClientOrNull } from "../lib/stripe";

/**
 * Create a Stripe Account Link for cleaner Express onboarding.
 * Idempotently creates the Express account if it doesn't exist yet.
 * Returns the URL to redirect the cleaner to.
 */
export const createCleanerStripeAccountLink = action({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const stripe = getStripeClientOrNull();
    if (!stripe) throw new Error("Stripe is not configured");

    const data = await ctx.runQuery(
      internal.queries.cleanerStripeConnect.getCleanerForConnect,
      { userId: args.userId },
    );
    if (!data) throw new Error("User not found");

    let accountId = data.stripeConnectAccountId;

    // Create Express account if missing
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: data.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: {
          convexUserId: String(data.userId),
          convexCompanyId: String(data.companyId),
        },
      });

      accountId = account.id;

      await ctx.runMutation(
        internal.mutations.cleanerStripeConnect.setCleanerStripeConnectAccount,
        {
          userId: data.userId,
          stripeConnectAccountId: account.id,
        },
      );
    }

    const appUrl = process.env.APP_URL ?? "http://localhost:5173";

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${appUrl}/settings?stripe=refresh`,
      return_url: `${appUrl}/settings?stripe=return`,
      type: "account_onboarding",
    });

    return { url: accountLink.url };
  },
});
