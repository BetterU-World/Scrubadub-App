"use node";

declare const process: { env: Record<string, string | undefined> };

import Stripe from "stripe";
import { randomUUID } from "node:crypto";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { hashPassword, verifyBcryptPassword } from "../lib/password";
import {
  validatePassword,
  validateEmail,
  validateName,
} from "../lib/validation";

import { planToEnvVar, planToTier, type ScrubPlan } from "../lib/plans";
import { issueSession } from "../lib/sessions";

function getPriceIdForPlan(plan: ScrubPlan): string {
  const envVar = planToEnvVar(plan);
  const priceId = process.env[envVar];
  if (!priceId) {
    throw new Error(`${envVar} env var not set`);
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
    plan: v.optional(v.union(v.literal("solo"), v.literal("team"), v.literal("pro"))),
    checkoutAttemptId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<string | null> => {
    const checkoutAttemptId = args.checkoutAttemptId ?? randomUUID();
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(checkoutAttemptId)) {
      throw new Error("Invalid checkout attempt");
    }
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

    const selectedPlan: ScrubPlan = args.plan ?? "pro";
    const internalTier = planToTier(selectedPlan);

    const customer = await stripe.customers.create({
      email,
      metadata: { source: "public_checkout" },
    }, { idempotencyKey: `public-checkout:${checkoutAttemptId}:customer` });

    const APP_URL =
      process.env.APP_URL ?? "https://scrubadub-app-frontend.vercel.app";

    const priceId = getPriceIdForPlan(selectedPlan);
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 14,
        metadata: { source: "public_checkout", tier: internalTier },
      },
      allow_promotion_codes: true,
      success_url: `${APP_URL}/setup?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/get-started?canceled=true`,
      metadata: {
        source: "public_checkout",
        customerEmail: email,
        tier: internalTier,
      },
    }, { idempotencyKey: `public-checkout:${checkoutAttemptId}:session` });

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
  ): Promise<{
    userId: Id<"users">;
    companyId: Id<"companies">;
    sessionToken: string;
    sessionExpiresAt: number;
    sessionIdleExpiresAt: number;
  }> => {
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
    if (session.metadata?.source !== "public_checkout") {
      throw new Error("This checkout session cannot be used for account setup.");
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

    const email = (customer as Stripe.Customer).email?.toLowerCase().trim();
    if (!email) {
      throw new Error("No email associated with this checkout session.");
    }

    validateEmail(email);

    // Get subscription details for syncing
    const subscription =
      typeof session.subscription === "string"
        ? await stripe.subscriptions.retrieve(session.subscription)
        : session.subscription;

    // Hash outside the transaction; all SCRUB records are then reconciled and
    // committed atomically using the Checkout Session ID.
    const passwordHash = await hashPassword(args.password);
    const rawTier = session.metadata?.tier;
    const tier = rawTier === "scrub_solo" || rawTier === "scrub_team" || rawTier === "scrub_pro"
      ? rawTier
      : undefined;
    const provisioned = await ctx.runMutation(
      internal.authInternal.provisionPublicCheckout,
      {
        stripeCheckoutSessionId: session.id,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription?.id,
        stripePriceId: subscription?.items?.data?.[0]?.price?.id,
        subscriptionStatus: subscription?.status,
        currentPeriodEnd: subscription
          ? (subscription as any).current_period_end ?? 0
          : undefined,
        cancelAtPeriodEnd: subscription?.cancel_at_period_end,
        tier,
        email,
        passwordHash,
        name: args.name,
        companyName: args.companyName,
        timezone: args.timezone ?? "America/New_York",
      }
    );
    const { userId, companyId } = provisioned;

    if (provisioned.alreadyCompleted) {
      const passwordMatches = await verifyBcryptPassword(
        args.password,
        provisioned.passwordHash
      );
      if (!passwordMatches) {
        throw new Error("Setup is already complete. Please sign in instead.");
      }
    }

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

    const authSession = await issueSession(ctx, { principalType: "staff", userId });
    return { userId, companyId, ...authSession };
  },
});
