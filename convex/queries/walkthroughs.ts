import { query } from "../_generated/server";
import { v } from "convex/values";
import { getSessionUser } from "../lib/auth";

async function requireOwnerCompany(ctx: any, userId: any) {
  const user = await getSessionUser(ctx, userId);
  if (user.role !== "owner" || !user.companyId) {
    throw new Error("Owner access required");
  }
  return user;
}

function sortNewestFirst(items: any[]) {
  return items.sort((a, b) => b.updatedAt - a.updatedAt);
}

async function decorateWalkthrough(ctx: any, walkthrough: any) {
  const relationship = walkthrough.clientRelationshipId
    ? await ctx.db.get(walkthrough.clientRelationshipId)
    : null;
  return {
    ...walkthrough,
    clientRelationship:
      relationship?.companyId === walkthrough.companyId
        ? {
            _id: relationship._id,
            displayName: relationship.displayName,
            businessName: relationship.businessName,
            clientType: relationship.clientType,
            status: relationship.status,
          }
        : null,
  };
}

export const getById = query({
  args: {
    userId: v.id("users"),
    walkthroughId: v.id("walkthroughs"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.userId);
    const walkthrough = await ctx.db.get(args.walkthroughId);
    if (!walkthrough) return null;
    if (walkthrough.companyId !== owner.companyId) throw new Error("Access denied");
    return await decorateWalkthrough(ctx, walkthrough);
  },
});

export const listByClientRequest = query({
  args: {
    userId: v.id("users"),
    clientRequestId: v.id("clientRequests"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.userId);
    const request = await ctx.db.get(args.clientRequestId);
    if (!request) return [];
    if (request.companyId !== owner.companyId) throw new Error("Access denied");

    const walkthroughs = await ctx.db
      .query("walkthroughs")
      .withIndex("by_clientRequest", (q: any) =>
        q.eq("clientRequestId", args.clientRequestId)
      )
      .collect();

    const scoped = sortNewestFirst(
      walkthroughs.filter((walkthrough: any) => walkthrough.companyId === owner.companyId)
    );
    return await Promise.all(scoped.map((walkthrough: any) => decorateWalkthrough(ctx, walkthrough)));
  },
});

export const listByCommercialAccount = query({
  args: {
    userId: v.id("users"),
    commercialAccountId: v.id("commercialAccounts"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.userId);
    const account = await ctx.db.get(args.commercialAccountId);
    if (!account) return [];
    if (account.companyId !== owner.companyId) throw new Error("Access denied");

    const walkthroughs = await ctx.db
      .query("walkthroughs")
      .withIndex("by_commercialAccount", (q: any) =>
        q.eq("commercialAccountId", args.commercialAccountId)
      )
      .collect();

    const scoped = sortNewestFirst(
      walkthroughs.filter((walkthrough: any) => walkthrough.companyId === owner.companyId)
    );
    return await Promise.all(scoped.map((walkthrough: any) => decorateWalkthrough(ctx, walkthrough)));
  },
});

export const listByProposal = query({
  args: {
    userId: v.id("users"),
    proposalId: v.id("proposals"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.userId);
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) return [];
    if (proposal.companyId !== owner.companyId) throw new Error("Access denied");

    const walkthroughs = await ctx.db
      .query("walkthroughs")
      .withIndex("by_proposal", (q: any) => q.eq("proposalId", args.proposalId))
      .collect();

    const scoped = sortNewestFirst(
      walkthroughs.filter((walkthrough: any) => walkthrough.companyId === owner.companyId)
    );
    return await Promise.all(scoped.map((walkthrough: any) => decorateWalkthrough(ctx, walkthrough)));
  },
});
