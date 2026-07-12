import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireOwnerSession } from "../lib/sessionAuth";
import { ensureClientRelationshipForLead } from "../lib/clientRelationships";

const frequencyValidator = v.union(
  v.literal("one_time"),
  v.literal("weekly"),
  v.literal("biweekly"),
  v.literal("monthly"),
  v.literal("quarterly"),
  v.literal("custom")
);

const statusValidator = v.union(
  v.literal("active"),
  v.literal("paused"),
  v.literal("ended")
);

const accountFields = {
  clientRelationshipId: v.optional(v.id("clientRelationships")),
  clientName: v.string(),
  contactName: v.optional(v.string()),
  contactEmail: v.optional(v.string()),
  contactPhone: v.optional(v.string()),
  serviceAddress: v.optional(v.string()),
  contractAmountCents: v.optional(v.number()),
  serviceFrequency: v.optional(frequencyValidator),
  startDate: v.optional(v.string()),
  renewalDate: v.optional(v.string()),
  assignedManagerId: v.optional(v.id("users")),
  assignedCleanerId: v.optional(v.id("users")),
  assignedTeamId: v.optional(v.id("teams")),
  status: statusValidator,
  notes: v.optional(v.string()),
};

async function requireOwnerCompany(ctx: any, sessionToken: string, userId: any) {
  const user = await requireOwnerSession(ctx, sessionToken, userId);
  if (user.role !== "owner" || !user.companyId) {
    throw new Error("Owner access required");
  }
  return user;
}

function cleanOptional(value: string | undefined, max = 1000) {
  const trimmed = value?.trim().slice(0, max);
  return trimmed || undefined;
}

function cleanRequired(value: string, fallback: string, max = 200) {
  return value.trim().slice(0, max) || fallback;
}

function cleanAmount(value: number | undefined) {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new Error("Contract amount must be a non-negative whole-cent value");
  }
  if (value > 1_000_000_000) throw new Error("Contract amount is too large");
  return value;
}

async function assertUserAssignment(ctx: any, userId: any, companyId: any, role: string) {
  if (!userId) return undefined;
  const user = await ctx.db.get(userId);
  if (!user || user.companyId !== companyId || user.status !== "active" || user.role !== role) {
    throw new Error(`Assigned ${role} must be active in your company`);
  }
  return userId;
}

async function assertTeamAssignment(ctx: any, teamId: any, companyId: any) {
  if (!teamId) return undefined;
  const team = await ctx.db.get(teamId);
  if (!team || team.companyId !== companyId || !team.active) {
    throw new Error("Assigned team must be active in your company");
  }
  return teamId;
}

async function assertClientRelationship(ctx: any, relationshipId: any, companyId: any) {
  if (!relationshipId) return undefined;
  const relationship = await ctx.db.get(relationshipId);
  if (!relationship || relationship.companyId !== companyId) {
    throw new Error("Client relationship must belong to your company");
  }
  return relationshipId;
}

async function buildAccountPatch(ctx: any, companyId: any, args: any) {
  return {
    clientRelationshipId: await assertClientRelationship(
      ctx,
      args.clientRelationshipId,
      companyId
    ),
    clientName: cleanRequired(args.clientName, "Commercial Account", 200),
    contactName: cleanOptional(args.contactName, 200),
    contactEmail: cleanOptional(args.contactEmail, 200)?.toLowerCase(),
    contactPhone: cleanOptional(args.contactPhone, 50),
    serviceAddress: cleanOptional(args.serviceAddress, 500),
    contractAmountCents: cleanAmount(args.contractAmountCents),
    serviceFrequency: args.serviceFrequency,
    startDate: cleanOptional(args.startDate, 50),
    renewalDate: cleanOptional(args.renewalDate, 50),
    assignedManagerId: await assertUserAssignment(
      ctx,
      args.assignedManagerId,
      companyId,
      "manager"
    ),
    assignedCleanerId: await assertUserAssignment(
      ctx,
      args.assignedCleanerId,
      companyId,
      "cleaner"
    ),
    assignedTeamId: await assertTeamAssignment(ctx, args.assignedTeamId, companyId),
    status: args.status,
    notes: cleanOptional(args.notes, 4000),
  };
}

export const create = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    clientRequestId: v.optional(v.id("clientRequests")),
    sourceLeadId: v.optional(v.id("clientRequests")),
    sourceProposalId: v.optional(v.id("proposals")),
    serviceAgreementId: v.optional(v.id("serviceAgreements")),
    ...accountFields,
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.sessionToken, args.userId);
    const companyId = owner.companyId!;

    const proposal = args.sourceProposalId
      ? await ctx.db.get(args.sourceProposalId)
      : null;
    if (args.sourceProposalId) {
      if (!proposal) throw new Error("Proposal not found");
      if (proposal.companyId !== companyId) throw new Error("Access denied");
      if (proposal.status !== "accepted") {
        throw new Error("Commercial accounts can only be created from accepted proposals");
      }
      const existing = await ctx.db
        .query("commercialAccounts")
        .withIndex("by_sourceProposalId", (q) =>
          q.eq("sourceProposalId", args.sourceProposalId)
        )
        .first();
      if (existing) return existing._id;
    }

    const sourceProposalId = args.sourceProposalId;
    const agreement = args.serviceAgreementId
      ? await ctx.db.get(args.serviceAgreementId)
      : sourceProposalId
        ? await ctx.db
            .query("serviceAgreements")
            .withIndex("by_proposal", (q) =>
              q.eq("proposalId", sourceProposalId)
            )
            .first()
        : null;
    if (agreement) {
      if (agreement.companyId !== companyId) throw new Error("Access denied");
      if (args.sourceProposalId && agreement.proposalId !== args.sourceProposalId) {
        throw new Error("Service agreement must match the source proposal");
      }
    }

    const clientRequestId = args.clientRequestId ?? proposal?.clientRequestId;
    const request = clientRequestId ? await ctx.db.get(clientRequestId) : null;
    if (clientRequestId) {
      if (!request) throw new Error("Lead not found");
      if (request.companyId !== companyId) throw new Error("Access denied");
    }

    if (args.sourceLeadId) {
      const lead = await ctx.db.get(args.sourceLeadId);
      if (!lead) throw new Error("Lead not found");
      if (lead.companyId !== companyId) throw new Error("Access denied");
    }

    const now = Date.now();
    const clientRelationshipId =
      args.clientRelationshipId ??
      (agreement as any)?.clientRelationshipId ??
      (proposal as any)?.clientRelationshipId ??
      (request ? await ensureClientRelationshipForLead(ctx, request) : undefined);
    const accountPatch = await buildAccountPatch(ctx, companyId, {
      ...args,
      clientRelationshipId,
    });
    const accountId = await ctx.db.insert("commercialAccounts", {
      companyId,
      clientRequestId,
      sourceLeadId: args.sourceLeadId ?? clientRequestId,
      sourceProposalId: args.sourceProposalId,
      serviceAgreementId: agreement?._id,
      ...accountPatch,
      createdAt: now,
      updatedAt: now,
    });
    if (agreement && !agreement.commercialAccountId) {
      await ctx.db.patch(agreement._id, {
        commercialAccountId: accountId,
        clientRelationshipId: agreement.clientRelationshipId ?? clientRelationshipId,
        updatedAt: now,
      });
    }
    if (args.sourceProposalId) {
      const walkthrough = await ctx.db
        .query("walkthroughs")
        .withIndex("by_proposal", (q: any) => q.eq("proposalId", args.sourceProposalId))
        .first();
      if (walkthrough && walkthrough.companyId === companyId && !walkthrough.commercialAccountId) {
        await ctx.db.patch(walkthrough._id, {
          commercialAccountId: accountId,
          clientRelationshipId: walkthrough.clientRelationshipId ?? clientRelationshipId,
          updatedAt: now,
        });
      }
    }
    if (request?.propertyId && clientRelationshipId) {
      const property = await ctx.db.get(request.propertyId);
      if (property && property.companyId === companyId && !property.clientRelationshipId) {
        await ctx.db.patch(property._id, { clientRelationshipId });
      }
    }
    return accountId;
  },
});

export const update = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    accountId: v.id("commercialAccounts"),
    ...accountFields,
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.sessionToken, args.userId);
    const account = await ctx.db.get(args.accountId);
    if (!account) throw new Error("Commercial account not found");
    if (account.companyId !== owner.companyId) throw new Error("Access denied");

    const patch = await buildAccountPatch(ctx, owner.companyId, args);
    await ctx.db.patch(args.accountId, {
      ...patch,
      updatedAt: Date.now(),
    });

    if (patch.clientRelationshipId && account.clientRequestId) {
      const request = await ctx.db.get(account.clientRequestId);
      if (request?.companyId === owner.companyId && request.propertyId) {
        const property = await ctx.db.get(request.propertyId);
        if (property && property.companyId === owner.companyId && !property.clientRelationshipId) {
          await ctx.db.patch(property._id, {
            clientRelationshipId: patch.clientRelationshipId,
          });
        }
      }
    }
  },
});
