"use node";

declare const process: { env: Record<string, string | undefined> };

import Stripe from "stripe";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { hashPassword } from "../lib/password";
import {
  validatePassword,
  validateEmail,
  validateName,
} from "../lib/validation";

function getOwnerPriceId(): string {
  const priceId = process.env.STRIPE_PRICE_CLEANING_OWNER;
  if (!priceId) {
    throw new Error("STRIPE_PRICE_CLEANING_OWNER env var not set");
  }
  return priceId;
}

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

/**
 * Public checkout session — no auth required.
 * Collects email, creates a Stripe customer + checkout session,
 * and redirects to Stripe. On success the user lands on /setup
 * to create their account.
 */
export const createPublicCheckoutSession = action({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args): Promise<string | null> => {
    const email = args.email.toLowerCase().trim();
    validateEmail(email);

    // Block if email already has an account
    const existing = await ctx.runQuery(
      internal.authInternal.getUserByEmail,
      { email }
    );
    if (existing) {
      throw new Error(
        "An account with this email already exists. Please sign in instead."
      );
    }

    const stripe = getStripe();

    const customer = await stripe.customers.create({
      email,
      metadata: { source: "public_checkout" },
    });

    const APP_URL =
      process.env.APP_URL ?? "https://scrubadub-app-frontend.vercel.app";

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: "subscription",
      line_items: [{ price: getOwnerPriceId(), quantity: 1 }],
      subscription_data: {
        trial_period_days: 14,
        metadata: { source: "public_checkout" },
      },
      allow_promotion_codes: true,
      success_url: `${APP_URL}/setup?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/get-started?canceled=true`,
      metadata: {
        source: "public_checkout",
        customerEmail: email,
      },
    });

    return session.url ?? null;
  },
});

/**
 * Complete account setup after a successful public checkout.
 * Retrieves the Stripe session to verify payment, then creates
 * the company + owner user and links the Stripe customer.
 */
export const completePublicSetup = action({
  args: {
    stripeSessionId: v.string(),
    name: v.string(),
    password: v.string(),
    companyName: v.string(),
    timezone: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ userId: Id<"users">; companyId: Id<"companies"> }> => {
    validatePassword(args.password);
    validateName(args.name);
    validateName(args.companyName);

    const stripe = getStripe();

    // Retrieve checkout session to verify payment
    const session = await stripe.checkout.sessions.retrieve(
      args.stripeSessionId,
      { expand: ["subscription", "customer"] }
    );

    if (session.status !== "complete") {
      throw new Error(
        "Checkout session is not complete. Please try again."
      );
    }

    const customerId =
      typeof session.customer === "string"
        ? session.customer
        : session.customer?.id;

    if (!customerId) {
      throw new Error("Unable to retrieve payment information.");
    }

    // Get customer email from Stripe
    const customer =
      typeof session.customer === "string"
        ? await stripe.customers.retrieve(session.customer)
        : session.customer;

    if (!customer || customer.deleted) {
      throw new Error("Unable to retrieve customer information.");
    }

    const email = (customer as Stripe.Customer).email?.toLowerCase();
    if (!email) {
      throw new Error("No email associated with this checkout session.");
    }

    validateEmail(email);

    // Idempotent check — if account already exists, they should sign in
    const existingUser = await ctx.runQuery(
      internal.authInternal.getUserByEmail,
      { email }
    );
    if (existingUser) {
      throw new Error(
        "An account with this email already exists. Please sign in instead."
      );
    }

    // Get subscription details for syncing
    const subscription =
      typeof session.subscription === "string"
        ? await stripe.subscriptions.retrieve(session.subscription)
        : session.subscription;

    // Create company
    const companyId: Id<"companies"> = await ctx.runMutation(
      internal.authInternal.createCompany,
      {
        name: args.companyName,
        timezone: args.timezone ?? "America/New_York",
      }
    );

    // Link Stripe customer to company
    await ctx.runMutation(internal.mutations.billing.setStripeCustomerId, {
      companyId,
      stripeCustomerId: customerId,
    });

    // Sync subscription status directly (the webhook may have already
    // fired and missed because the company didn't exist yet)
    if (subscription) {
      const priceId = subscription.items?.data?.[0]?.price?.id ?? "";
      await ctx.runMutation(internal.mutations.billing.syncSubscription, {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId,
        status: subscription.status,
        currentPeriodEnd:
          (subscription as any).current_period_end ?? 0,
        cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
      });
    }

    // Hash password and create owner user
    const passwordHash = await hashPassword(args.password);
    const userId: Id<"users"> = await ctx.runMutation(
      internal.authInternal.createUser,
      {
        email,
        passwordHash,
        name: args.name,
        companyId,
        role: "owner",
        status: "active",
      }
    );

    // Update Stripe metadata with internal IDs for future webhook correlation
    await stripe.customers.update(customerId, {
      metadata: {
        companyId: companyId,
        ownerUserId: userId,
        source: "public_checkout",
      },
    });

    if (subscription) {
      await stripe.subscriptions.update(subscription.id, {
        metadata: {
          companyId: companyId,
          ownerUserId: userId,
          tier: "cleaning_owner",
        },
      });
    }

    return { userId, companyId };
  },
});
