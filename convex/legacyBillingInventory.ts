import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { isFounderEmail } from "./lib/founderEmails";
import { subscriptionAllowsWrites } from "./lib/stripeSubscriptionCompatibility";

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/** Operator-only diagnostic. No emails, user IDs, Stripe IDs or configuration leave this query. */
export const page = internalQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    asOf: v.number(),
    confirmation: v.literal("READ ONLY LEGACY BILLING INVENTORY"),
  },
  returns: v.object({
    page: v.array(v.object({
      companyId: v.id("companies"),
      subscriptionStatus: v.union(v.string(), v.null()),
      complimentaryEntitlement: v.union(v.literal("active"), v.literal("inactive"), v.literal("absent")),
      operationalAccessChange: v.object({
        ownerWorkspaceRestricted: v.boolean(),
        backendWritesRestricted: v.boolean(),
      }),
    })),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.asOf) || args.asOf < 0) throw new Error("Invalid inventory timestamp");
    if (!Number.isInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 50) {
      throw new Error("Inventory page size must be 1–50");
    }
    // Scan every user, not one lookup per email: duplicate emails and inactive owners
    // also qualify under the existing rule. Bound each invocation, including sparse pages.
    const users = await ctx.db.query("users").withIndex("by_creation_time").paginate(args.paginationOpts);
    const companyIds = new Set(users.page
      .filter(user => user.role === "owner" && user.companyId && isFounderEmail(user.email))
      .map(user => user.companyId!));
    const page = await Promise.all([...companyIds].map(async companyId => {
      const company = await ctx.db.get(companyId);
      if (!company) throw new Error("Dangling legacy owner relationship; inventory incomplete");
      // Duplicate entitlements fail rather than silently reporting access as safe.
      const entitlement = await ctx.db.query("complimentarySubscriptions")
        .withIndex("by_companyId", q => q.eq("companyId", companyId)).unique();
      const comp = entitlement?.active === true;
      // Mirror App.tsx's production owner-workspace gate, including its distinct grace clock.
      const workspaceAllowed = comp || company.subscriptionStatus === "active" || company.subscriptionStatus === "trialing" ||
        (company.subscriptionBecameInactiveAt != null && args.asOf - company.subscriptionBecameInactiveAt < THREE_DAYS_MS);
      return {
        companyId,
        subscriptionStatus: company.subscriptionStatus ?? null,
        complimentaryEntitlement: entitlement ? (entitlement.active ? "active" as const : "inactive" as const) : "absent" as const,
        operationalAccessChange: {
          ownerWorkspaceRestricted: !workspaceAllowed,
          backendWritesRestricted: !(comp || subscriptionAllowsWrites(company.subscriptionStatus, company.currentPeriodEnd, args.asOf)),
        },
      };
    }));
    return { page, continueCursor: users.continueCursor, isDone: users.isDone };
  },
});
