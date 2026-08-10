import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireOwnerManagerSession, requireOwnerSession } from "../lib/sessionAuth";
import { createNotification, logAudit } from "../lib/helpers";
import { currentDateForTimezone, isFutureActiveCommercialJob } from "../lib/commercialAccountLifecycle";
import { ensureClientRelationshipForLead } from "../lib/clientRelationships";
import {
  commercialEligibilityError,
  resolveCommercialEligibility,
} from "../lib/commercialEligibility";

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
const propertyConditionOverrideValidator = v.union(
  v.literal("company_default"), v.literal("required"), v.literal("not_required")
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
  propertyConditionCheckOverride: v.optional(propertyConditionOverrideValidator),
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
    propertyConditionCheckOverride: args.propertyConditionCheckOverride ?? "company_default",
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

    if (!args.sourceProposalId) {
      throw new Error("An accepted proposal is required to create a commercial account");
    }
    const proposal = await ctx.db.get(args.sourceProposalId);
    if (!proposal) throw new Error("Proposal not found");
    if (proposal.companyId !== companyId) throw new Error("Access denied");
    if (proposal.status !== "accepted") {
      throw new Error("Commercial accounts can only be created from accepted proposals");
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
    if (!request) throw new Error("Source request required");
    if (request.companyId !== companyId) throw new Error("Access denied");
    if (proposal.clientRequestId !== request._id) {
      throw new Error("Source request must match the accepted proposal");
    }
    const eligibility = await resolveCommercialEligibility(ctx, request, companyId);
    if (!eligibility.eligible) throw new Error(commercialEligibilityError(eligibility));

    const existing = await ctx.db
      .query("commercialAccounts")
      .withIndex("by_sourceProposalId", (q) =>
        q.eq("sourceProposalId", args.sourceProposalId)
      )
      .first();
    if (existing) return existing._id;

    if (args.sourceLeadId) {
      if (args.sourceLeadId !== request._id) {
        throw new Error("Source lead must match the accepted proposal request");
      }
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
    if (account.status === "ended") throw new Error("Ended commercial accounts cannot be edited");
    if (args.status !== account.status) throw new Error("Use a commercial account lifecycle action to change status");

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

const pauseReasonValidator = v.union(
  v.literal("client_request"), v.literal("seasonal_pause"), v.literal("property_unavailable"),
  v.literal("payment_issue"), v.literal("staffing_issue"), v.literal("contract_review"),
  v.literal("safety_concern"), v.literal("other")
);
const endReasonValidator = v.union(
  v.literal("client_terminated"), v.literal("company_terminated"), v.literal("contract_completed"),
  v.literal("nonpayment"), v.literal("pricing_disagreement"), v.literal("service_quality_issue"),
  v.literal("property_closed"), v.literal("safety_concern"), v.literal("other")
);

function cleanLifecycleNotes(notes: string | undefined) {
  return cleanOptional(notes, 4000);
}

async function lifecycleContext(ctx: any, args: any) {
  const actor = await requireOwnerSession(ctx, args.sessionToken, args.userId);
  const account = await ctx.db.get(args.commercialAccountId) as any;
  if (!account) throw new Error("Commercial account not found");
  if (account.companyId !== actor.companyId) throw new Error("Access denied");
  return { actor, account };
}

async function futureActiveJobCount(ctx: any, account: any) {
  const company = await ctx.db.get(account.companyId);
  const today = currentDateForTimezone(company?.timezone);
  const jobs = await ctx.db.query("jobs").withIndex("by_commercialAccount", (q: any) => q.eq("commercialAccountId", account._id)).collect();
  return jobs.filter((job: any) => isFutureActiveCommercialJob(job, today)).length;
}

async function notifyLifecycle(ctx: any, actor: any, account: any, type: "paused" | "resumed" | "ended") {
  const recipients = new Set<any>();
  if (actor.role === "owner" && account.assignedManagerId) recipients.add(account.assignedManagerId);
  if (actor.role === "manager") {
    const users = await ctx.db.query("users").collect();
    users.filter((user: any) => user.companyId === actor.companyId && user.role === "owner" && user.status === "active").forEach((user: any) => recipients.add(user._id));
  }
  recipients.delete(actor._id);
  for (const userId of recipients) {
    await createNotification(ctx, {
      companyId: actor.companyId, userId, type: `commercial_account_${type}` as any,
      title: `Commercial account ${type}`,
      message: `${account.clientName} was ${type} by ${actor.name}.`,
      relatedCommercialAccountId: account._id,
    });
  }
}

async function transition(ctx: any, args: any, target: "paused" | "active" | "ended", eventType: "paused" | "resumed" | "ended") {
  const { actor, account } = await lifecycleContext(ctx, args);
  const allowed = eventType === "paused" ? account.status === "active" : eventType === "resumed" ? account.status === "paused" : account.status !== "ended";
  if (!allowed) throw new Error(`Commercial account cannot be ${eventType} from ${account.status}`);
  const notes = cleanLifecycleNotes(args.notes);
  const reason = args.reason?.trim();
  if (eventType !== "resumed" && !reason) throw new Error("Reason is required");
  if (reason === "other" && !notes) throw new Error("Notes are required when reason is Other");
  const now = Date.now();
  const count = await futureActiveJobCount(ctx, account);
  const event = { type: eventType, occurredAt: now, actorId: actor._id, actorName: actor.name, actorRole: actor.role, reason: reason || undefined, notes };
  await ctx.db.patch(account._id, { status: target, lifecycleHistory: [...(account.lifecycleHistory ?? []), event], updatedAt: now });
  await notifyLifecycle(ctx, actor, account, eventType);
  await logAudit(ctx, { companyId: actor.companyId, userId: actor._id, action: `${eventType === "paused" ? "pause" : eventType === "resumed" ? "resume" : "end"}_commercial_account`, entityType: "commercialAccount", entityId: String(account._id), details: JSON.stringify({ priorStatus: account.status, newStatus: target, reason: reason || null, notes: notes || null, actorRole: actor.role, actorName: actor.name, futureActiveJobCount: count }) });
  return { status: target, changed: true, futureActiveJobCount: count };
}

export const pauseCommercialAccount = mutation({
  args: { commercialAccountId: v.id("commercialAccounts"), reason: pauseReasonValidator, notes: v.optional(v.string()), userId: v.id("users"), sessionToken: v.string() },
  handler: (ctx, args) => transition(ctx, args, "paused", "paused"),
});

export const resumeCommercialAccount = mutation({
  args: { commercialAccountId: v.id("commercialAccounts"), notes: v.optional(v.string()), userId: v.id("users"), sessionToken: v.string() },
  handler: (ctx, args) => transition(ctx, args, "active", "resumed"),
});

export const endCommercialAccount = mutation({
  args: { commercialAccountId: v.id("commercialAccounts"), reason: endReasonValidator, notes: v.optional(v.string()), userId: v.id("users"), sessionToken: v.string() },
  handler: (ctx, args) => transition(ctx, args, "ended", "ended"),
});
