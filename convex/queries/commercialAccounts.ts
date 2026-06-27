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

async function decorateAccount(ctx: any, account: any) {
  const [manager, cleaner, team] = await Promise.all([
    account.assignedManagerId ? ctx.db.get(account.assignedManagerId) : null,
    account.assignedCleanerId ? ctx.db.get(account.assignedCleanerId) : null,
    account.assignedTeamId ? ctx.db.get(account.assignedTeamId) : null,
  ]);

  return {
    ...account,
    assignedManagerName: manager?.name ?? null,
    assignedCleanerName: cleaner?.name ?? null,
    assignedTeamName: team?.name ?? null,
  };
}

export const getByProposal = query({
  args: {
    userId: v.id("users"),
    proposalId: v.id("proposals"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.userId);
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) return null;
    if (proposal.companyId !== owner.companyId) throw new Error("Access denied");

    const account = await ctx.db
      .query("commercialAccounts")
      .withIndex("by_sourceProposalId", (q) =>
        q.eq("sourceProposalId", args.proposalId)
      )
      .first();

    if (!account) return null;
    if (account.companyId !== owner.companyId) throw new Error("Access denied");
    return await decorateAccount(ctx, account);
  },
});

export const getByClientRequest = query({
  args: {
    userId: v.id("users"),
    clientRequestId: v.id("clientRequests"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.userId);
    const request = await ctx.db.get(args.clientRequestId);
    if (!request) return null;
    if (request.companyId !== owner.companyId) throw new Error("Access denied");

    const account = await ctx.db
      .query("commercialAccounts")
      .withIndex("by_clientRequestId", (q) =>
        q.eq("clientRequestId", args.clientRequestId)
      )
      .first();

    if (!account) return null;
    if (account.companyId !== owner.companyId) throw new Error("Access denied");
    return await decorateAccount(ctx, account);
  },
});
