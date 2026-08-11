import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireOwnerOrManagerCapability } from "../lib/sessionAuth";

async function requireOwnerCompany(ctx: any, sessionToken: string, userId: any) {
  return await requireOwnerOrManagerCapability(
    ctx, sessionToken, userId, "canManageSalesAndCommercial"
  );
}

function sortNewestFirst(items: any[]) {
  return items.sort((a, b) => b.updatedAt - a.updatedAt);
}

async function decorateWalkthrough(ctx: any, walkthrough: any) {
  const assignedManager = walkthrough.assignedManagerId
    ? await ctx.db.get(walkthrough.assignedManagerId)
    : null;
  const relationship = walkthrough.clientRelationshipId
    ? await ctx.db.get(walkthrough.clientRelationshipId)
    : null;
  const directProperty = walkthrough.propertyId ? await ctx.db.get(walkthrough.propertyId) : null;
  let clientRequest = walkthrough.clientRequestId
    ? await ctx.db.get(walkthrough.clientRequestId)
    : null;
  const commercialAccount = walkthrough.commercialAccountId
    ? await ctx.db.get(walkthrough.commercialAccountId)
    : null;

  if (!clientRequest && commercialAccount?.clientRequestId) {
    clientRequest = await ctx.db.get(commercialAccount.clientRequestId);
  }

  const requestProperty =
    !directProperty && clientRequest?.propertyId
      ? await ctx.db.get(clientRequest.propertyId)
      : null;
  const property =
    directProperty?.companyId === walkthrough.companyId
      ? directProperty
      : requestProperty?.companyId === walkthrough.companyId
        ? requestProperty
        : null;

  return {
    ...walkthrough,
    assignedManager: assignedManager?.companyId === walkthrough.companyId
      ? { _id: assignedManager._id, name: assignedManager.name, email: assignedManager.email }
      : null,
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
    property: property
      ? {
          _id: property._id,
          name: property.name,
          type: property.type,
          address: property.address,
          squareFootage: property.squareFootage,
          beds: property.beds,
          bedrooms: property.bedrooms,
          baths: property.baths,
          amenities: property.amenities,
          accessInstructions: property.accessInstructions,
          pillowCount: property.pillowCount,
          sheetSets: property.sheetSets,
          towelCount: property.towelCount,
          restroomCount: property.restroomCount,
          trashCanCount: property.trashCanCount,
        }
      : null,
    clientRequest:
      clientRequest?.companyId === walkthrough.companyId
        ? {
            _id: clientRequest._id,
            leadType: clientRequest.leadType,
            propertySnapshot: clientRequest.propertySnapshot,
          }
        : null,
  };
}

export const getById = query({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    walkthroughId: v.id("walkthroughs"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.sessionToken, args.userId);
    const walkthrough = await ctx.db.get(args.walkthroughId);
    if (!walkthrough) return null;
    if (walkthrough.companyId !== owner.companyId) throw new Error("Access denied");
    return await decorateWalkthrough(ctx, walkthrough);
  },
});

export const listByClientRequest = query({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    clientRequestId: v.id("clientRequests"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.sessionToken, args.userId);
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
    sessionToken: v.string(),
    commercialAccountId: v.id("commercialAccounts"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.sessionToken, args.userId);
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
    sessionToken: v.string(),
    proposalId: v.id("proposals"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.sessionToken, args.userId);
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

export const listCalendarWalkthroughs = query({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    companyId: v.id("companies"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.sessionToken, args.userId);
    if (owner.companyId !== args.companyId) throw new Error("Access denied");

    const walkthroughs = await ctx.db
      .query("walkthroughs")
      .withIndex("by_companyId_scheduledDate", (q: any) =>
        q
          .eq("companyId", args.companyId)
          .gte("scheduledDate", args.startDate)
          .lte("scheduledDate", args.endDate)
      )
      .collect();

    return await Promise.all(
      walkthroughs
        .filter((walkthrough: any) =>
          walkthrough.status !== "archived" &&
          walkthrough.appointmentStatus !== "cancelled" &&
          Boolean(walkthrough.scheduledDate && walkthrough.scheduledStartTime)
        )
        .map(async (walkthrough: any) => {
          const property: any = walkthrough.propertyId ? await ctx.db.get(walkthrough.propertyId) : null;
          const request: any = walkthrough.clientRequestId ? await ctx.db.get(walkthrough.clientRequestId) : null;
          const assignedManager: any = walkthrough.assignedManagerId
            ? await ctx.db.get(walkthrough.assignedManagerId)
            : null;
          return {
            _id: walkthrough._id,
            title: walkthrough.title,
            scheduledDate: walkthrough.scheduledDate!,
            scheduledStartTime: walkthrough.scheduledStartTime!,
            scheduledEndTime: walkthrough.scheduledEndTime,
            appointmentStatus: walkthrough.appointmentStatus,
            clientRequestId:
              request?.companyId === owner.companyId ? walkthrough.clientRequestId : undefined,
            propertyId:
              property?.companyId === owner.companyId ? walkthrough.propertyId : undefined,
            propertyName:
              property?.companyId === owner.companyId
                ? property.name
                : request?.companyId === owner.companyId
                  ? request.propertySnapshot?.name || request.businessName || request.requesterName
                  : undefined,
            assignedManager:
              assignedManager?.companyId === owner.companyId
                ? { _id: assignedManager._id, name: assignedManager.name }
                : null,
          };
        })
    );
  },
});
