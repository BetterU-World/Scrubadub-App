"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { generateSecureToken } from "./lib/tokens";

/**
 * Backfill: generate a publicRequestToken for every company that
 * doesn't have one yet.  Safe to re-run — skips companies that
 * already have a token.
 *
 * Run via CLI or dashboard:
 *   npx convex run clientPortalActions:backfillPublicRequestTokens
 */
export const backfillPublicRequestTokens = action({
  args: {},
  handler: async (ctx) => {
    const companyIds = await ctx.runQuery(
      internal.clientPortalInternal.getCompaniesWithoutToken
    );

    let count = 0;
    for (const companyId of companyIds) {
      const token = generateSecureToken();
      await ctx.runMutation(
        internal.clientPortalInternal.setPublicRequestToken,
        { companyId, token }
      );
      count++;
    }

    return { backfilled: count };
  },
});

/**
 * Generate a publicRequestToken for a single company.
 * Requires the caller to be an active owner of the company.
 * No-op if the company already has a token.
 */
export const generatePublicRequestToken = action({
  args: {
    companyId: v.id("companies"),
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<{ generated: boolean; token?: string }> => {
    // Verify the caller is an active owner of this company
    const isOwner: boolean = await ctx.runQuery(
      internal.clientPortalInternal.verifyOwner,
      { userId: args.userId, companyId: args.companyId }
    );
    if (!isOwner) {
      throw new Error("Owner access required");
    }

    // Check if company already has a token
    const company: { publicRequestToken?: string } | null =
      await ctx.runQuery(internal.clientPortalInternal.getCompany, {
        companyId: args.companyId,
      });
    if (!company) {
      throw new Error("Company not found");
    }
    if (company.publicRequestToken) {
      return { generated: false, token: company.publicRequestToken };
    }

    // Generate and persist a new token
    const token = generateSecureToken();
    await ctx.runMutation(
      internal.clientPortalInternal.setPublicRequestToken,
      { companyId: args.companyId, token }
    );

    return { generated: true, token };
  },
});
