import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { getSessionUser } from "../lib/auth";

const DAY_MS = 24 * 60 * 60 * 1000;

async function requireOwnerCompany(ctx: any, userId: any) {
  const user = await getSessionUser(ctx, userId);
  if (user.role !== "owner" || !user.companyId) {
    throw new Error("Owner access required");
  }
  return user;
}

function cleanOptional(value: string | undefined, max = 4000) {
  const trimmed = value?.trim().slice(0, max);
  return trimmed || undefined;
}

function cleanRequired(value: string, fallback: string, max = 200) {
  return value.trim().slice(0, max) || fallback;
}

function parseDate(value: string, label: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`${label} must be a valid date`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must be a valid date`);
  }
  return date;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function assertDateRange(startDate: string, endDate: string) {
  const start = parseDate(startDate, "Billing start date");
  const end = parseDate(endDate, "Billing end date");
  if (end < start) throw new Error("Billing end date must be after start date");
  if ((end.getTime() - start.getTime()) / DAY_MS > 366) {
    throw new Error("Billing range cannot exceed one year");
  }
}

async function getOwnedAccount(ctx: any, userId: any, commercialAccountId: any) {
  const owner = await requireOwnerCompany(ctx, userId);
  const account = await ctx.db.get(commercialAccountId);
  if (!account) throw new Error("Commercial account not found");
  if (account.companyId !== owner.companyId) throw new Error("Access denied");
  return { owner, account };
}

async function getOwnedInvoice(ctx: any, userId: any, invoiceId: any) {
  const owner = await requireOwnerCompany(ctx, userId);
  const invoice = await ctx.db.get(invoiceId);
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.companyId !== owner.companyId) throw new Error("Access denied");
  return { owner, invoice };
}

async function assertJobsInvoiceable(ctx: any, companyId: any, commercialAccountId: any, jobIds: any[]) {
  const uniqueJobIds = [...new Set(jobIds)];
  if (uniqueJobIds.length === 0) throw new Error("Invoice must include at least one job");

  const jobs = await Promise.all(uniqueJobIds.map((jobId) => ctx.db.get(jobId)));
  for (const job of jobs) {
    if (!job) throw new Error("Job not found");
    if (job.companyId !== companyId) throw new Error("Access denied");
    if (job.commercialAccountId !== commercialAccountId) {
      throw new Error("All jobs must belong to the same commercial account");
    }
    if (job.status !== "approved") throw new Error("Only approved completed jobs can be invoiced");
  }

  const invoices = await ctx.db
    .query("invoices")
    .withIndex("by_company", (q: any) => q.eq("companyId", companyId))
    .collect();
  const billedJobIds = new Set(
    invoices
      .filter((invoice: any) => invoice.status !== "void")
      .flatMap((invoice: any) => invoice.jobIds)
  );
  const duplicate = uniqueJobIds.find((jobId) => billedJobIds.has(jobId));
  if (duplicate) throw new Error("One or more jobs are already attached to an invoice");

  return jobs;
}

async function nextInvoiceNumber(ctx: any, companyId: any) {
  const invoices = await ctx.db
    .query("invoices")
    .withIndex("by_company", (q: any) => q.eq("companyId", companyId))
    .collect();
  const next = invoices.length + 1;
  return `INV-${String(next).padStart(5, "0")}`;
}

function invoiceTotals(account: any) {
  const subtotalCents = account.contractAmountCents ?? 0;
  const taxCents = 0;
  return {
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
  };
}

export const create = mutation({
  args: {
    userId: v.id("users"),
    commercialAccountId: v.id("commercialAccounts"),
    title: v.string(),
    billingStartDate: v.string(),
    billingEndDate: v.string(),
    issueDate: v.string(),
    dueDate: v.string(),
    jobIds: v.array(v.id("jobs")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { account } = await getOwnedAccount(ctx, args.userId, args.commercialAccountId);
    assertDateRange(args.billingStartDate, args.billingEndDate);
    parseDate(args.issueDate, "Issue date");
    parseDate(args.dueDate, "Due date");
    const jobs = await assertJobsInvoiceable(
      ctx,
      account.companyId,
      account._id,
      args.jobIds
    );
    if (
      jobs.some(
        (job: any) =>
          job.scheduledDate < args.billingStartDate ||
          job.scheduledDate > args.billingEndDate
      )
    ) {
      throw new Error("All jobs must fall within the billing period");
    }
    const now = Date.now();
    const totals = invoiceTotals(account);

    return await ctx.db.insert("invoices", {
      companyId: account.companyId,
      commercialAccountId: account._id,
      title: cleanRequired(args.title, "Commercial Invoice", 200),
      invoiceNumber: await nextInvoiceNumber(ctx, account.companyId),
      status: "draft",
      billingStartDate: args.billingStartDate,
      billingEndDate: args.billingEndDate,
      issueDate: args.issueDate,
      dueDate: args.dueDate,
      ...totals,
      jobIds: jobs.map((job: any) => job._id),
      notes: cleanOptional(args.notes),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const generateFromJobs = mutation({
  args: {
    userId: v.id("users"),
    commercialAccountId: v.id("commercialAccounts"),
    billingStartDate: v.string(),
    billingEndDate: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { account } = await getOwnedAccount(ctx, args.userId, args.commercialAccountId);
    assertDateRange(args.billingStartDate, args.billingEndDate);

    const existingInvoices = await ctx.db
      .query("invoices")
      .withIndex("by_company", (q: any) => q.eq("companyId", account.companyId))
      .collect();
    const billedJobIds = new Set(
      existingInvoices
        .filter((invoice: any) => invoice.status !== "void")
        .flatMap((invoice: any) => invoice.jobIds)
    );

    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_commercialAccount", (q: any) =>
        q.eq("commercialAccountId", account._id)
      )
      .collect();

    const inRange = jobs.filter(
      (job: any) =>
        job.companyId === account.companyId &&
        job.scheduledDate >= args.billingStartDate &&
        job.scheduledDate <= args.billingEndDate
    );
    const completedJobs = inRange.filter((job: any) => job.status === "approved");
    const invoiceJobs = completedJobs.filter((job: any) => !billedJobIds.has(job._id));
    const skippedJobs = inRange.filter(
      (job: any) => job.status !== "approved" || billedJobIds.has(job._id)
    );

    if (invoiceJobs.length === 0) {
      return {
        invoiceId: null,
        jobsIncluded: [],
        jobsSkipped: skippedJobs.map((job: any) => ({
          jobId: job._id,
          scheduledDate: job.scheduledDate,
          reason: billedJobIds.has(job._id) ? "already_invoiced" : "not_completed",
        })),
      };
    }

    const now = Date.now();
    const issueDate = formatDate(new Date(now));
    const dueDate = formatDate(addDays(new Date(now), 30));
    const totals = invoiceTotals(account);
    const invoiceId = await ctx.db.insert("invoices", {
      companyId: account.companyId,
      commercialAccountId: account._id,
      title: `${account.clientName} Invoice`,
      invoiceNumber: await nextInvoiceNumber(ctx, account.companyId),
      status: "draft",
      billingStartDate: args.billingStartDate,
      billingEndDate: args.billingEndDate,
      issueDate,
      dueDate,
      ...totals,
      jobIds: invoiceJobs.map((job: any) => job._id),
      notes: cleanOptional(args.notes),
      createdAt: now,
      updatedAt: now,
    });

    return {
      invoiceId,
      jobsIncluded: invoiceJobs.map((job: any) => ({
        jobId: job._id,
        scheduledDate: job.scheduledDate,
      })),
      jobsSkipped: skippedJobs.map((job: any) => ({
        jobId: job._id,
        scheduledDate: job.scheduledDate,
        reason: billedJobIds.has(job._id) ? "already_invoiced" : "not_completed",
      })),
    };
  },
});

export const updateDraft = mutation({
  args: {
    userId: v.id("users"),
    invoiceId: v.id("invoices"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { invoice } = await getOwnedInvoice(ctx, args.userId, args.invoiceId);
    if (invoice.status !== "draft") throw new Error("Only draft invoices can be edited");
    await ctx.db.patch(args.invoiceId, {
      notes: cleanOptional(args.notes),
      updatedAt: Date.now(),
    });
  },
});

export const markIssued = mutation({
  args: {
    userId: v.id("users"),
    invoiceId: v.id("invoices"),
  },
  handler: async (ctx, args) => {
    const { invoice } = await getOwnedInvoice(ctx, args.userId, args.invoiceId);
    if (invoice.status !== "draft") throw new Error("Only draft invoices can be issued");
    const now = Date.now();
    await ctx.db.patch(args.invoiceId, {
      status: "issued",
      issuedAt: now,
      updatedAt: now,
    });
  },
});

export const markPaid = mutation({
  args: {
    userId: v.id("users"),
    invoiceId: v.id("invoices"),
  },
  handler: async (ctx, args) => {
    const { invoice } = await getOwnedInvoice(ctx, args.userId, args.invoiceId);
    if (invoice.status !== "issued") throw new Error("Only issued invoices can be marked paid");
    const now = Date.now();
    await ctx.db.patch(args.invoiceId, {
      status: "paid",
      paidAt: now,
      updatedAt: now,
    });
  },
});

export const voidInvoice = mutation({
  args: {
    userId: v.id("users"),
    invoiceId: v.id("invoices"),
  },
  handler: async (ctx, args) => {
    const { invoice } = await getOwnedInvoice(ctx, args.userId, args.invoiceId);
    if (invoice.status === "void") return;
    if (invoice.status === "paid") throw new Error("Paid invoices cannot be voided");
    const now = Date.now();
    await ctx.db.patch(args.invoiceId, {
      status: "void",
      voidedAt: now,
      updatedAt: now,
    });
  },
});
