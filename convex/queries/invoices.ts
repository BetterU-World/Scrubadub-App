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

async function decorateInvoice(ctx: any, invoice: any) {
  const account = await ctx.db.get(invoice.commercialAccountId);
  const relationship = invoice.clientRelationshipId
    ? await ctx.db.get(invoice.clientRelationshipId)
    : null;
  const jobs = await Promise.all(invoice.jobIds.map((jobId: any) => ctx.db.get(jobId)));
  return {
    ...invoice,
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

export const getById = query({
  args: {
    userId: v.id("users"),
    invoiceId: v.id("invoices"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.userId);
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) return null;
    if (invoice.companyId !== owner.companyId) throw new Error("Access denied");
    return await decorateInvoice(ctx, invoice);
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
    const owner = await requireOwnerCompany(ctx, args.userId);
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
