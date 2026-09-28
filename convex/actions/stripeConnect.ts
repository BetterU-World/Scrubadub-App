"use node";
import { action } from "../_generated/server";
import { v } from "convex/values";
import { requireStaffSession } from "../lib/sessions";
import { retireLegacyOutgoing } from "../lib/legacyOutgoingRetirement";
import { areExternalSideEffectsDisabled } from "../lib/environment";

/** Shared configuration probe; client billing still uses the configured Stripe client. */
export const isStripeConfigured = action({
  args: {},
  handler: async () => !areExternalSideEffectsDisabled() && !!process.env.STRIPE_SECRET_KEY,
});

/** Retained fail-closed public compatibility boundary. Current affiliates use
 * affiliateStripeConnect and never write the legacy worker account field. */
export const startStripeConnectOnboarding = action({
  args: { userId: v.id("users"), sessionToken: v.string(), returnTo: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireStaffSession(ctx, args.sessionToken, args.userId);
    return retireLegacyOutgoing();
  },
});

/** Legacy user-account refresh cannot restart or mutate retired worker onboarding. */
export const syncMyStripeConnectStatus = action({
  args: { userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireStaffSession(ctx, args.sessionToken, args.userId);
    return retireLegacyOutgoing();
  },
});
