import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

/** Set the publicRequestToken on a company. */
export const setPublicRequestToken = internalMutation({
  args: {
    companyId: v.id("companies"),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.companyId, {
      publicRequestToken: args.token,
    });
  },
});

/** Return all company IDs that are missing a publicRequestToken. */
export const getCompaniesWithoutToken = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("companies").collect();
    return all
      .filter((c) => !c.publicRequestToken)
      .map((c) => c._id);
  },
});

/** Get a single company (used by actions that need to inspect it). */
export const getCompany = internalQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.companyId);
  },
});

/** Verify a user is an active owner of the given company. */
export const verifyOwner = internalQuery({
  args: {
    userId: v.id("users"),
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || user.status !== "active" || user.role !== "owner") {
      return false;
    }
    return user.companyId === args.companyId;
  },
});
