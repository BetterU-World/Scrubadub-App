import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireOwnerOrManagerCapability } from "../lib/sessionAuth";
import { resolveCommercialEligibility } from "../lib/commercialEligibility";
import { currentDateForTimezone, isFutureActiveCommercialJob } from "../lib/commercialAccountLifecycle";

async function requireOwnerCompany(ctx: any, sessionToken: string, userId: any) {
  const user = await requireOwnerOrManagerCapability(
    ctx, sessionToken, userId, "canManageSalesAndCommercial"
  );
  if (!user.companyId) throw new Error("Company access required");
  return user;
}

async function decorateAccount(ctx: any, account: any) {
  const [manager, cleaner, team, request, clientRelationship] = await Promise.all([
    account.assignedManagerId ? ctx.db.get(account.assignedManagerId) : null,
    account.assignedCleanerId ? ctx.db.get(account.assignedCleanerId) : null,
    account.assignedTeamId ? ctx.db.get(account.assignedTeamId) : null,
    account.clientRequestId ? ctx.db.get(account.clientRequestId) : null,
    account.clientRelationshipId ? ctx.db.get(account.clientRelationshipId) : null,
  ]);
  const [property, proposal] = await Promise.all([
    request?.propertyId ? ctx.db.get(request.propertyId) : null,
    account.sourceProposalId ? ctx.db.get(account.sourceProposalId) : null,
  ]);
  const sourceLead = request?.companyId === account.companyId ? request : null;
  const sourceProposal = proposal?.companyId === account.companyId ? proposal : null;
  const linkedProperty = property?.companyId === account.companyId ? property : null;
  const company = await ctx.db.get(account.companyId);
  const today = currentDateForTimezone(company?.timezone);
  const accountJobs = await ctx.db.query("jobs").withIndex("by_commercialAccount", (q: any) => q.eq("commercialAccountId", account._id)).collect();
  const futureActiveJobCount = accountJobs.filter((job: any) => isFutureActiveCommercialJob(job, today)).length;

  return {
    ...account,
    assignedManagerName: manager?.name ?? null,
    assignedCleanerName: cleaner?.name ?? null,
    assignedTeamName: team?.name ?? null,
    futureActiveJobCount,
    clientRelationship:
      clientRelationship?.companyId === account.companyId
        ? {
            _id: clientRelationship._id,
            displayName: clientRelationship.displayName,
            businessName: clientRelationship.businessName,
            clientType: clientRelationship.clientType,
            status: clientRelationship.status,
          }
        : null,
    sourceLead: sourceLead
      ? {
          _id: sourceLead._id,
          requesterName: sourceLead.requesterName,
          businessName: sourceLead.businessName,
          propertyAddress: sourceLead.propertySnapshot?.address ?? null,
        }
      : null,
    sourceProposal: sourceProposal
      ? {
          _id: sourceProposal._id,
          title: sourceProposal.title,
          status: sourceProposal.status,
          addOnLineItems: sourceProposal.addOnLineItems ?? [],
        }
      : null,
    linkedProperty: linkedProperty
      ? {
          _id: linkedProperty._id,
          name: linkedProperty.name,
          address: linkedProperty.address,
          type: linkedProperty.type,
          active: linkedProperty.active,
        }
      : null,
  };
}

export const listByCompany = query({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    status: v.optional(
      v.union(v.literal("active"), v.literal("paused"), v.literal("ended"))
    ),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.sessionToken, args.userId);
    const companyId = owner.companyId!;

    const status = args.status;
    const accounts = status
      ? await ctx.db
          .query("commercialAccounts")
          .withIndex("by_companyId_status", (q) =>
            q.eq("companyId", companyId).eq("status", status)
          )
          .collect()
      : await ctx.db
          .query("commercialAccounts")
          .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
          .collect();

    accounts.sort((a, b) => b.updatedAt - a.updatedAt);
    return await Promise.all(accounts.map((account) => decorateAccount(ctx, account)));
  },
});

export const getById = query({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    accountId: v.id("commercialAccounts"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.sessionToken, args.userId);
    const account = await ctx.db.get(args.accountId);
    if (!account) return null;
    if (account.companyId !== owner.companyId) throw new Error("Access denied");
    return await decorateAccount(ctx, account);
  },
});

export const getByProposal = query({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    proposalId: v.id("proposals"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.sessionToken, args.userId);
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
    sessionToken: v.string(),
    clientRequestId: v.id("clientRequests"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.sessionToken, args.userId);
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

export const getEligibilityForRequest = query({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    clientRequestId: v.id("clientRequests"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.sessionToken, args.userId);
    const request = await ctx.db.get(args.clientRequestId);
    if (!request) throw new Error("Request not found");
    return await resolveCommercialEligibility(ctx, request, owner.companyId);
  },
});
