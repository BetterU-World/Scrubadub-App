"use node";

declare const process: { env: Record<string, string | undefined> };

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { getStripeClientOrNull } from "../lib/stripe";

/**
 * Get or create an affiliate Stripe Connect account for the user.
 *
 * Priority:
 * 1. Return existing affiliateStripeAccountId if set
 * 2. Reuse company.stripeConnectAccountId if user is an owner and company has one
 * 3. Create a new Express account
 */
export const getOrCreateAffiliateStripeAccount = action({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const stripe = getStripeClientOrNull();
    if (!stripe) throw new Error("Stripe is not configured");

    const data = await ctx.runQuery(
      internal.queries.stripeConnect.getUserAndCompanyForAffiliateConnect,
      { userId: args.userId }
    );
    if (!data) throw new Error("User not found");

    // 1. Already has affiliate account
    if (data.affiliateStripeAccountId) {
      return data.affiliateStripeAccountId;
    }

    // 2. Owner with company Connect → reuse
    if (data.role === "owner" && data.companyStripeConnectAccountId) {
      await ctx.runMutation(
        internal.mutations.stripeConnect.setAffiliateStripeAccount,
        {
          userId: args.userId,
          affiliateStripeAccountId: data.companyStripeConnectAccountId,
        }
      );
      return data.companyStripeConnectAccountId;
    }

    // 3. Create new Express account
    const account = await stripe.accounts.create({
      type: "express",
      email: data.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { convexUserId: String(data._id), purpose: "affiliate" },
    });

    await ctx.runMutation(
      internal.mutations.stripeConnect.setAffiliateStripeAccount,
      {
        userId: args.userId,
        affiliateStripeAccountId: account.id,
      }
    );

    return account.id;
  },
});

/**
 * Create an Account Link for affiliate Stripe Connect onboarding.
 * Calls getOrCreateAffiliateStripeAccount internally via shared logic.
 */
export const createAffiliateStripeAccountLink = action({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const stripe = getStripeClientOrNull();
    if (!stripe) throw new Error("Stripe is not configured");

    const data = await ctx.runQuery(
      internal.queries.stripeConnect.getUserAndCompanyForAffiliateConnect,
      { userId: args.userId }
    );
    if (!data) throw new Error("User not found");

    let accountId = data.affiliateStripeAccountId;

    if (!accountId) {
      // Reuse company connect if owner
      if (data.role === "owner" && data.companyStripeConnectAccountId) {
        accountId = data.companyStripeConnectAccountId;
      } else {
        // Create new Express account
        const account = await stripe.accounts.create({
          type: "express",
          email: data.email,
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          metadata: { convexUserId: String(data._id), purpose: "affiliate" },
        });
        accountId = account.id;
      }

      await ctx.runMutation(
        internal.mutations.stripeConnect.setAffiliateStripeAccount,
        {
          userId: args.userId,
          affiliateStripeAccountId: accountId,
        }
      );
    }

    const appUrl =
      process.env.APP_URL ?? "http://localhost:5173";

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${appUrl}/affiliate/stripe/refresh`,
      return_url: `${appUrl}/affiliate/stripe/return`,
      type: "account_onboarding",
    });

    return { url: accountLink.url };
  },
});
