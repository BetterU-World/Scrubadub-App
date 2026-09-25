import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireOwnerManagerSession } from "../lib/sessionAuth";
import { hasOwnerOrManagerPermission, hasManagerPermission } from "../lib/auth";
import { calculateInvoiceTotals } from "../lib/invoiceAddOnLineItems";
import { getActiveTeamIdsForUser } from "../lib/teams";
import { assertInvoiceInvariant, invoiceDisplayLines } from "../lib/invoiceModel";
import { resolveJobInvoiceablePricing } from "../lib/jobPricing";

async function decorateInvoice(ctx: any, invoice: any) {
  const type = assertInvoiceInvariant(invoice);
  const displayLines = invoiceDisplayLines(invoice);
  const computedTotals = calculateInvoiceTotals(invoice.baseSubtotalCents ?? invoice.subtotalCents, displayLines, invoice.taxCents);
  const account = invoice.commercialAccountId ? await ctx.db.get(invoice.commercialAccountId) : null;
  const relationship = invoice.clientRelationshipId
    ? await ctx.db.get(invoice.clientRelationshipId)
    : null;
  const clientUser = relationship?.clientUserId ? await ctx.db.get(relationship.clientUserId) : null;
  const jobs = await Promise.all(invoice.jobIds.map((jobId: any) => ctx.db.get(jobId)));
  const paymentAttempts = await ctx.db.query("invoicePaymentAttempts").withIndex("by_invoiceId", (q: any) => q.eq("invoiceId", invoice._id)).collect();
  const paymentExceptions = await ctx.db.query("invoicePaymentExceptions").withIndex("by_invoiceIdCandidate", (q: any) => q.eq("invoiceIdCandidate", String(invoice._id))).collect();
  return {
    ...invoice,
    invoiceType: type,
    displayLines,
    computedTotals,
    onlinePayment: paymentAttempts.find((attempt: any) => attempt._id === invoice.canonicalPaymentAttemptId) ? { platformFeeCents: 200, stripePaymentIntentId: invoice.stripePaymentIntentId } : null,
    paymentReconciliationRequired: paymentAttempts.some((attempt: any) => attempt.status === "reconciliation_required") || paymentExceptions.length > 0,
    commercialAccountName:
      account?.companyId === invoice.companyId ? account.clientName : null,
    clientRelationship:
      relationship?.companyId === invoice.companyId
        ? {
            _id: relationship._id,
            displayName: relationship.displayName,
            businessName: relationship.businessName,
            clientType: relationship.clientType,
            status: relationship.status,
            hasEmail: !!relationship.email,
            hasPortalAccess: relationship.status === "active" && clientUser?.status === "active",
          }
        : null,
    jobs: jobs
      .filter((job: any) => job && job.companyId === invoice.companyId)
      .map((job: any) => ({
        _id: job._id,
        scheduledDate: job.scheduledDate,
        status: job.status,
        completedAt: job.completedAt,
        notes: job.notes,
      })),
  };
}

export const getForResidentialJob = query({
  args: { userId: v.id("users"), sessionToken: v.string(), jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const actor = await requireInvoiceReader(ctx, args.sessionToken, args.userId);
    const job = await ctx.db.get(args.jobId);
    if (!job || job.companyId !== actor.companyId) throw new Error("Access denied");
    if (job.commercialAccountId) return { kind: "commercial" as const };
    if (actor.role === "manager" && !hasManagerPermission(actor, "canSeeAllJobs") && !hasManagerPermission(actor, "canManageInvoices")) {
      const teamIds = await getActiveTeamIdsForUser(ctx, actor._id, actor.companyId);
      if (!job.cleanerIds.includes(actor._id) && job.assignedManagerId !== actor._id && !(job.assignedTeamId && teamIds.has(job.assignedTeamId))) throw new Error("Job access required");
    }
    const invoices = await ctx.db.query("invoices").withIndex("by_companyId_sourceJobId", q => q.eq("companyId", actor.companyId).eq("sourceJobId", job._id)).collect();
    invoices.sort((a, b) => b.createdAt - a.createdAt);
    const active = invoices.find(invoice => invoice.status !== "void");
    const readiness = await resolveJobInvoiceablePricing(ctx, job._id, actor.companyId);
    return { kind: "job" as const, readiness, activeInvoice: active ? { _id: active._id, invoiceNumber: active.invoiceNumber, status: active.status } : null, voidInvoices: invoices.filter(invoice => invoice.status === "void").map(invoice => ({ _id: invoice._id, invoiceNumber: invoice.invoiceNumber, status: invoice.status })), canManage: actor.role === "owner" || actor.canManageInvoices === true };
  },
});

export const getBillingForJob = query({
  args: { userId: v.id("users"), sessionToken: v.string(), jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const actor = await requireInvoiceReader(ctx, args.sessionToken, args.userId);
    const job = await ctx.db.get(args.jobId);
    if (!job || job.companyId !== actor.companyId) throw new Error("Access denied");
    if (actor.role === "manager" && !hasManagerPermission(actor, "canSeeAllJobs")) {
      const teamIds = await getActiveTeamIdsForUser(ctx, actor._id, actor.companyId);
      if (!job.cleanerIds.includes(actor._id) && job.assignedManagerId !== actor._id && !(job.assignedTeamId && teamIds.has(job.assignedTeamId))) throw new Error("Job access required");
    }
    if (!job.commercialAccountId) return { kind: "non_commercial" as const };
    const account = await ctx.db.get(job.commercialAccountId);
    if (!account || account.companyId !== actor.companyId) throw new Error("Commercial account not found");
    const invoices = await ctx.db.query("invoices")
      .withIndex("by_company", q => q.eq("companyId", actor.companyId)).collect();
    const existing = invoices.find(invoice => invoice.status !== "void" && invoice.jobIds.includes(job._id));
    return {
      kind: "commercial" as const,
      jobStatus: job.status,
      scheduledDate: job.scheduledDate,
      commercialAccountId: account._id,
      accountName: account.clientName,
      existingInvoice: existing ? { _id: existing._id, invoiceNumber: existing.invoiceNumber, status: existing.status } : null,
    };
  },
});

async function requireInvoiceReader(ctx: any, sessionToken: string, userId: any) {
  const actor = await requireOwnerManagerSession(ctx, sessionToken, userId);
  if (!hasOwnerOrManagerPermission(actor, "canManageInvoices") &&
      !hasOwnerOrManagerPermission(actor, "canViewFinancials")) {
    throw new Error("Invoice access required");
  }
  return actor;
}

export const getById = query({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    invoiceId: v.id("invoices"),
  },
  handler: async (ctx, args) => {
    const owner = await requireInvoiceReader(ctx, args.sessionToken, args.userId);
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) return null;
    if (invoice.companyId !== owner.companyId) throw new Error("Access denied");
    return await decorateInvoice(ctx, invoice);
  },
});

export const listByCommercialAccount = query({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    commercialAccountId: v.id("commercialAccounts"),
  },
  handler: async (ctx, args) => {
    const owner = await requireInvoiceReader(ctx, args.sessionToken, args.userId);
    const account = await ctx.db.get(args.commercialAccountId);
    if (!account) return [];
    if (account.companyId !== owner.companyId) throw new Error("Access denied");

    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_commercialAccount", (q: any) =>
        q.eq("commercialAccountId", args.commercialAccountId)
      )
      .collect();

    const scoped = invoices.filter((invoice: any) => invoice.companyId === owner.companyId);
    scoped.sort((a: any, b: any) => b.createdAt - a.createdAt);
    return await Promise.all(scoped.map((invoice: any) => decorateInvoice(ctx, invoice)));
  },
});

export const listByCompany = query({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("issued"),
        v.literal("paid"),
        v.literal("void")
      )
    ),
  },
  handler: async (ctx, args) => {
    const owner = await requireInvoiceReader(ctx, args.sessionToken, args.userId);
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_company", (q: any) => q.eq("companyId", owner.companyId))
      .collect();

    const scoped = invoices.filter(
      (invoice: any) => invoice.companyId === owner.companyId &&
        (!args.status || invoice.status === args.status)
    );
    scoped.sort((a: any, b: any) => b.createdAt - a.createdAt);
    return await Promise.all(scoped.map((invoice: any) => decorateInvoice(ctx, invoice)));
  },
});
