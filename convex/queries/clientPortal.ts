import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireVerifiedClientSession } from "../lib/sessionAuth";
import { companyAddOnSelectionVersion } from "../lib/companyAddOnSelection";
import { AUTHENTICATED_REQUEST_SERVICES, AUTHENTICATED_REQUEST_TIME_WINDOWS, deriveClientRequestStatus } from "../lib/clientRequestPortal";

const CAP = 500;
const authArgs = { clientUserId: v.id("clientUsers"), sessionToken: v.string() };

async function clientContext(ctx: any, args: { clientUserId: any; sessionToken: string }) {
  const clientUser = await requireVerifiedClientSession(ctx, args.sessionToken, args.clientUserId);
  const relationships = (
    await ctx.db
      .query("clientRelationships")
      .withIndex("by_clientUserId", (q: any) => q.eq("clientUserId", clientUser._id))
      .take(CAP)
  ).filter((relationship: any) => relationship.status === "active");
  const companies = await Promise.all(relationships.map((relationship: any) => ctx.db.get(relationship.companyId)));
  const companyNameById = new Map(
    companies.filter(Boolean).map((company: any) => [String(company._id), company.name])
  );
  const relationshipIdsByCompany = new Map<string, Set<string>>();
  for (const relationship of relationships) {
    const companyId = String(relationship.companyId);
    const ids = relationshipIdsByCompany.get(companyId) ?? new Set<string>();
    ids.add(String(relationship._id));
    relationshipIdsByCompany.set(companyId, ids);
  }
  const relationshipSummaries = relationships.map((relationship: any) => ({
    _id: relationship._id,
    companyId: relationship.companyId,
    companyName: companyNameById.get(String(relationship.companyId)) ?? "Provider",
    displayName: relationship.displayName,
    businessName: relationship.businessName,
    clientType: relationship.clientType,
    status: relationship.status,
  }));
  const companyNameByRelationshipId = new Map(
    relationshipSummaries.map((relationship: any) => [String(relationship._id), relationship.companyName])
  );
  return { clientUser, relationshipIdsByCompany, relationshipSummaries, companyNameByRelationshipId };
}

async function relatedRecords(ctx: any, context: any, table: string, index: string) {
  const records: any[] = [];
  for (const [companyId, relationshipIds] of context.relationshipIdsByCompany.entries()) {
    const companyRecords = await ctx.db
      .query(table)
      .withIndex(index, (q: any) => q.eq("companyId", companyId))
      .take(CAP);
    records.push(...companyRecords.filter((record: any) => relationshipIds.has(String(record.clientRelationshipId))));
  }
  return records;
}

function providerName(context: any, record: any) {
  return context.companyNameByRelationshipId.get(String(record.clientRelationshipId)) ?? "Provider";
}

export const getClientServices = query({
  args: authArgs,
  handler: async (ctx, args) => {
    const context = await clientContext(ctx, args);
    const [jobs, properties, commercialAccounts] = await Promise.all([
      relatedRecords(ctx, context, "jobs", "by_companyId_scheduledDate"),
      relatedRecords(ctx, context, "properties", "by_companyId"),
      relatedRecords(ctx, context, "commercialAccounts", "by_companyId"),
    ]);
    const propertyById = new Map(properties.map((item: any) => [String(item._id), item]));
    const accountById = new Map(commercialAccounts.map((item: any) => [String(item._id), item]));
    const project = (job: any) => {
      const property: any = job.propertyId ? propertyById.get(String(job.propertyId)) : null;
      const account: any = job.commercialAccountId ? accountById.get(String(job.commercialAccountId)) : null;
      return {
        _id: job._id,
        type: job.type,
        status: job.status,
        scheduledDate: job.scheduledDate,
        startTime: job.startTime,
        completedAt: job.completedAt,
        providerName: providerName(context, job),
        locationName: property?.name ?? account?.clientName,
        locationAddress: property?.address ?? account?.serviceAddress,
      };
    };
    const today = new Date().toISOString().slice(0, 10);
    return {
      clientName: context.clientUser.displayName,
      current: jobs.filter((job: any) => job.status === "in_progress").map(project),
      upcoming: jobs
        .filter((job: any) => job.scheduledDate >= today && !["in_progress", "cancelled", "approved"].includes(job.status))
        .sort((a: any, b: any) => a.scheduledDate.localeCompare(b.scheduledDate))
        .map(project),
      recent: jobs
        .filter((job: any) => job.completedAt || job.status === "approved")
        .sort((a: any, b: any) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
        .slice(0, 50)
        .map(project),
    };
  },
});

export const getClientDocuments = query({
  args: authArgs,
  handler: async (ctx, args) => {
    const context = await clientContext(ctx, args);
    const [proposals, agreements] = await Promise.all([
      relatedRecords(ctx, context, "proposals", "by_companyId"),
      relatedRecords(ctx, context, "serviceAgreements", "by_company"),
    ]);
    return {
      clientName: context.clientUser.displayName,
      proposals: proposals.sort((a, b) => b.updatedAt - a.updatedAt).map((proposal: any) => ({
        _id: proposal._id,
        title: proposal.title,
        businessName: proposal.businessName,
        propertyAddress: proposal.propertyAddress,
        serviceFrequency: proposal.serviceFrequency,
        monthlyPriceCents: proposal.monthlyPriceCents,
        oneTimePriceCents: proposal.oneTimePriceCents,
        status: proposal.status,
        providerName: providerName(context, proposal),
      })),
      agreements: agreements
        .filter((agreement: any) => ["sent", "signed", "cancelled"].includes(agreement.status))
        .sort((a: any, b: any) => b.updatedAt - a.updatedAt)
        .map((agreement: any) => ({
          _id: agreement._id,
          title: agreement.title,
          status: agreement.status,
          effectiveStartDate: agreement.effectiveStartDate,
          renewalDate: agreement.renewalDate,
          serviceFrequency: agreement.serviceFrequency,
          contractAmountCents: agreement.contractAmountCents,
          declinedAt: agreement.declinedAt,
          providerName: providerName(context, agreement),
        })),
    };
  },
});

export const getClientBilling = query({
  args: authArgs,
  handler: async (ctx, args) => {
    const context = await clientContext(ctx, args);
    const invoices = await relatedRecords(ctx, context, "invoices", "by_company");
    return {
      clientName: context.clientUser.displayName,
      invoices: invoices.sort((a, b) => b.updatedAt - a.updatedAt).map((invoice: any) => ({
        _id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        title: invoice.title,
        status: invoice.status,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        totalCents: invoice.totalCents,
        baseSubtotalCents: invoice.baseSubtotalCents ?? invoice.subtotalCents,
        addOnSubtotalCents: invoice.addOnSubtotalCents ?? 0,
        addOnLineItems: invoice.addOnLineItems ?? [],
        providerName: providerName(context, invoice),
      })),
    };
  },
});

export const getClientLocations = query({
  args: authArgs,
  handler: async (ctx, args) => {
    const context = await clientContext(ctx, args);
    const [properties, accounts] = await Promise.all([
      relatedRecords(ctx, context, "properties", "by_companyId"),
      relatedRecords(ctx, context, "commercialAccounts", "by_companyId"),
    ]);
    return {
      clientName: context.clientUser.displayName,
      properties: properties.map((property: any) => ({
        _id: property._id,
        name: property.name,
        address: property.address,
        type: property.type,
        active: property.active,
        providerName: providerName(context, property),
      })),
      commercialAccounts: accounts.map((account: any) => ({
        _id: account._id,
        name: account.clientName,
        address: account.serviceAddress,
        serviceFrequency: account.serviceFrequency,
        status: account.status,
        providerName: providerName(context, account),
      })),
    };
  },
});

export const getClientAccount = query({
  args: authArgs,
  handler: async (ctx, args) => {
    const context = await clientContext(ctx, args);
    return {
      clientUser: {
        displayName: context.clientUser.displayName,
        email: context.clientUser.email,
        phone: context.clientUser.phone,
        language: context.clientUser.language,
      },
      relationships: context.relationshipSummaries,
    };
  },
});

async function requestLinkedRecords(ctx: any, request: any) {
  const [proposals, agreements] = await Promise.all([
    ctx.db.query("proposals").withIndex("by_clientRequestId", (q: any) => q.eq("clientRequestId", request._id)).collect(),
    ctx.db.query("serviceAgreements").withIndex("by_clientRequest", (q: any) => q.eq("clientRequestId", request._id)).collect(),
  ]);
  const proposalIds = new Set(proposals.map((proposal: any) => String(proposal._id)));
  const companyJobs = await ctx.db.query("jobs").withIndex("by_companyId_scheduledDate", (q: any) => q.eq("companyId", request.companyId)).take(CAP);
  const jobs = companyJobs.filter((job: any) => job.sourceProposalId && proposalIds.has(String(job.sourceProposalId)));
  return { proposals, agreements, jobs };
}

function projectClientRequest(context: any, request: any, linked: any) {
  const today = new Date().toISOString().slice(0, 10);
  const activeJob = linked.jobs.find((job: any) => job.status === "in_progress")
    ?? linked.jobs.find((job: any) => !["cancelled", "approved"].includes(job.status) && job.scheduledDate >= today)
    ?? linked.jobs.find((job: any) => job.status === "approved" || job.completedAt);
  return {
    _id: request._id,
    requestedService: request.requestedService,
    providerName: providerName(context, request),
    locationName: request.propertySnapshot?.name,
    locationAddress: request.propertySnapshot?.address,
    submittedAt: request.createdAt,
    requestedDate: request.requestedDate,
    timeWindow: request.timeWindow,
    status: deriveClientRequestStatus({ requestStatus: request.status, ...linked, today }),
    actionRequired: linked.agreements.some((item: any) => item.status === "sent") || linked.proposals.some((item: any) => item.status === "sent"),
    scheduledService: activeJob ? { _id: activeJob._id, scheduledDate: activeJob.scheduledDate, startTime: activeJob.startTime, status: activeJob.status } : null,
  };
}

export const getClientRequestOptions = query({
  args: authArgs,
  handler: async (ctx, args) => {
    const context = await clientContext(ctx, args);
    const providers = [];
    for (const relationship of context.relationshipSummaries) {
      const [properties, accounts, addOns] = await Promise.all([
        ctx.db.query("properties").withIndex("by_companyId_clientRelationshipId", (q: any) => q.eq("companyId", relationship.companyId).eq("clientRelationshipId", relationship._id)).collect(),
        ctx.db.query("commercialAccounts").withIndex("by_companyId_clientRelationshipId_updatedAt", (q: any) => q.eq("companyId", relationship.companyId).eq("clientRelationshipId", relationship._id)).collect(),
        ctx.db.query("companyAddOns").withIndex("by_companyId_active_displayOrder", (q: any) => q.eq("companyId", relationship.companyId).eq("isActive", true)).collect(),
      ]);
      providers.push({
        ...relationship,
        locations: [
          ...properties.filter((item: any) => item.active).map((item: any) => ({ type: "property", id: item._id, name: item.name, address: item.address })),
          ...accounts.filter((item: any) => item.status === "active").map((item: any) => ({ type: "commercial_account", id: item._id, name: item.clientName, address: item.serviceAddress })),
        ],
        addOns: addOns.filter((item: any) => item.isPublic && item.archivedAt === undefined).map((item: any) => ({
          id: item._id, name: item.name, description: item.description, pricingMethod: item.pricingMethod,
          priceCents: item.priceCents, unitLabel: item.unitLabel, selectionVersion: companyAddOnSelectionVersion(item),
        })),
      });
    }
    return { clientName: context.clientUser.displayName, providers, services: AUTHENTICATED_REQUEST_SERVICES, timeWindows: AUTHENTICATED_REQUEST_TIME_WINDOWS };
  },
});

export const listClientRequests = query({
  args: authArgs,
  handler: async (ctx, args) => {
    const context = await clientContext(ctx, args);
    const requests: any[] = [];
    for (const relationship of context.relationshipSummaries) {
      const related = await ctx.db.query("clientRequests")
        .withIndex("by_companyId_clientRelationshipId_createdAt", (q: any) => q.eq("companyId", relationship.companyId).eq("clientRelationshipId", relationship._id))
        .order("desc").take(100);
      requests.push(...related.filter((request: any) => request.status !== "archived"));
    }
    const projected = await Promise.all(requests.map(async (request) => projectClientRequest(context, request, await requestLinkedRecords(ctx, request))));
    return { clientName: context.clientUser.displayName, requests: projected.sort((a, b) => b.submittedAt - a.submittedAt) };
  },
});

export const getClientRequestDetail = query({
  args: { ...authArgs, requestId: v.id("clientRequests") },
  handler: async (ctx, args) => {
    const context = await clientContext(ctx, args);
    const request = await ctx.db.get(args.requestId);
    if (!request?.clientRelationshipId) return { clientName: context.clientUser.displayName, request: null };
    const relationship = context.relationshipSummaries.find((item: any) => item._id === request.clientRelationshipId && item.companyId === request.companyId);
    if (!relationship || request.status === "archived") return { clientName: context.clientUser.displayName, request: null };
    const linked = await requestLinkedRecords(ctx, request);
    const summary = projectClientRequest(context, request, linked);
    return {
      clientName: context.clientUser.displayName,
      request: {
        ...summary,
        notes: request.notes,
        requestedAddOns: request.requestedAddOnSnapshots ?? [],
        proposals: linked.proposals.map((item: any) => ({ _id: item._id, title: item.title, status: item.status })),
        agreements: linked.agreements.filter((item: any) => ["sent", "signed", "cancelled"].includes(item.status)).map((item: any) => ({ _id: item._id, title: item.title, status: item.status, declinedAt: item.declinedAt })),
      },
    };
  },
});
