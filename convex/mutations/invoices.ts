import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireOwnerOrManagerCapability } from "../lib/sessionAuth";
import { buildInvoiceAddOnSnapshot, calculateInvoiceTotals } from "../lib/invoiceAddOnLineItems";
import { resolveJobInvoiceablePricing } from "../lib/jobPricing";
import { assertInvoiceInvariant, invoiceType } from "../lib/invoiceModel";

const DAY_MS = 24 * 60 * 60 * 1000;

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

async function getOwnedAccount(ctx: any, sessionToken: string, userId: any, commercialAccountId: any) {
  const owner = await requireOwnerOrManagerCapability(ctx, sessionToken, userId, "canManageInvoices");
  const account = await ctx.db.get(commercialAccountId);
  if (!account) throw new Error("Commercial account not found");
  if (account.companyId !== owner.companyId) throw new Error("Access denied");
  return { owner, account };
}

async function getOwnedInvoice(ctx: any, sessionToken: string, userId: any, invoiceId: any) {
  const owner = await requireOwnerOrManagerCapability(ctx, sessionToken, userId, "canManageInvoices");
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
  const used = new Set(invoices.map((invoice: any) => invoice.invoiceNumber));
  let next = invoices.length + 1;
  while (used.has(`INV-${String(next).padStart(5, "0")}`)) next++;
  return `INV-${String(next).padStart(5, "0")}`;
}

function checkedDueDays(days: number) {
  if (!Number.isSafeInteger(days) || days < 0 || days > 365) throw new Error("Payment due days must be between 0 and 365");
  return days;
}

export const createFromJob = mutation({
  args: { userId: v.id("users"), sessionToken: v.string(), jobId: v.id("jobs"), paymentDueDays: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const actor = await requireOwnerOrManagerCapability(ctx, args.sessionToken, args.userId, "canManageInvoices");
    const days = checkedDueDays(args.paymentDueDays ?? 30);
    const job = await ctx.db.get(args.jobId);
    if (!job || job.companyId !== actor.companyId) throw new Error("Access denied");
    if (job.commercialAccountId) throw new Error("Commercial jobs use account billing");
    const prior = await ctx.db.query("invoices").withIndex("by_companyId_sourceJobId", q => q.eq("companyId", actor.companyId).eq("sourceJobId", job._id)).collect();
    const active = prior.find(invoice => invoice.status !== "void");
    if (active) {
      if (active.status === "draft" && invoiceType(active) === "job") return active._id;
      throw new Error("Job already has an invoice");
    }
    const price = await resolveJobInvoiceablePricing(ctx, job._id, actor.companyId);
    if (!price.ok) throw new Error(`Job is not ready for invoicing: ${price.reason}`);
    const relationship = await ctx.db.get(price.clientRelationshipId) as any;
    if (!relationship || relationship.companyId !== actor.companyId || relationship.status !== "active" || job.clientRelationshipId !== relationship._id) throw new Error("Active client relationship required");
    const property = job.propertyId ? await ctx.db.get(job.propertyId) as any : null;
    if (property && property.companyId !== actor.companyId) throw new Error("Invalid job property");
    const totals = calculateInvoiceTotals(price.baseChargeCents, price.addOns.map(line => ({ lineTotalCents: line.amountCents } as any)), 0);
    if (totals.totalCents !== price.totalCents || totals.totalCents <= 0) throw new Error("Invalid accepted price");
    const now = Date.now();
    const candidate = {
      companyId: actor.companyId, invoiceType: "job" as const, clientRelationshipId: relationship._id,
      sourceJobId: job._id, jobIds: [job._id], paymentDueDays: days,
      jobPricingSnapshot: {
        baseChargeCents: price.baseChargeCents, addOns: price.addOns, totalCents: price.totalCents,
        currency: price.currency, pricingRevision: price.pricingRevision,
        pricingSource: price.priceSource as "direct_quote" | "post_service_quote" | "accepted_proposal",
        consentSource: price.consent.source, consentAcceptedAt: price.consent.acceptedAt,
        consentClientUserId: price.consent.clientUserId, consentRecordedByUserId: price.consent.recordedByUserId,
        offerId: price.consent.offerId, proposalIssueId: price.consent.proposalIssueId,
      },
      billToSnapshot: { displayName: relationship.displayName, email: relationship.email },
      serviceSnapshot: { scheduledDate: job.scheduledDate, jobType: job.type, locationName: property?.name ?? job.propertySnapshot?.name, address: property?.address ?? job.propertySnapshot?.address },
      title: `${job.scheduledDate} Service Invoice`, invoiceNumber: await nextInvoiceNumber(ctx, actor.companyId),
      status: "draft" as const, ...totals, createdAt: now, updatedAt: now,
    };
    assertInvoiceInvariant(candidate);
    return await ctx.db.insert("invoices", candidate);
  },
});

async function findDraftForBillingPeriod(
  ctx: any,
  companyId: any,
  commercialAccountId: any,
  billingStartDate: string,
  billingEndDate: string
) {
  const invoices = await ctx.db
    .query("invoices")
    .withIndex("by_commercialAccount", (q: any) =>
      q.eq("commercialAccountId", commercialAccountId)
    )
    .collect();

  return invoices.find(
    (invoice: any) =>
      invoice.companyId === companyId &&
      invoice.status === "draft" &&
      invoice.billingStartDate === billingStartDate &&
      invoice.billingEndDate === billingEndDate
  );
}

export const create = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
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
    const { account } = await getOwnedAccount(ctx, args.sessionToken, args.userId, args.commercialAccountId);
    assertDateRange(args.billingStartDate, args.billingEndDate);
    const existingDraft = await findDraftForBillingPeriod(
      ctx,
      account.companyId,
      account._id,
      args.billingStartDate,
      args.billingEndDate
    );
    if (existingDraft) {
      throw new Error("A draft invoice already exists for this billing period");
    }
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
    const addOns = await buildInvoiceAddOnSnapshot(ctx, account);
    const totals = calculateInvoiceTotals(account.contractAmountCents ?? 0, addOns.items);
    if (totals.totalCents <= 0) throw new Error("Invoice total must be greater than zero before billing");

    return await ctx.db.insert("invoices", {
      companyId: account.companyId,
      clientRelationshipId: account.clientRelationshipId,
      commercialAccountId: account._id,
      invoiceType: "commercial",
      title: cleanRequired(args.title, "Commercial Invoice", 200),
      invoiceNumber: await nextInvoiceNumber(ctx, account.companyId),
      status: "draft",
      billingStartDate: args.billingStartDate,
      billingEndDate: args.billingEndDate,
      issueDate: args.issueDate,
      dueDate: args.dueDate,
      ...totals,
      sourceProposalId: addOns.sourceProposalId,
      addOnLineItems: addOns.items.length ? addOns.items : undefined,
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
    sessionToken: v.string(),
    commercialAccountId: v.id("commercialAccounts"),
    billingStartDate: v.string(),
    billingEndDate: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { account } = await getOwnedAccount(ctx, args.sessionToken, args.userId, args.commercialAccountId);
    assertDateRange(args.billingStartDate, args.billingEndDate);
    const existingDraft = await findDraftForBillingPeriod(
      ctx,
      account.companyId,
      account._id,
      args.billingStartDate,
      args.billingEndDate
    );

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

    if (existingDraft) {
      return {
        invoiceId: existingDraft._id,
        existingInvoice: true,
        jobsIncluded: [],
        jobsSkipped: inRange.map((job: any) => ({
          jobId: job._id,
          scheduledDate: job.scheduledDate,
          reason: billedJobIds.has(job._id) ? "already_invoiced" : "draft_exists",
        })),
      };
    }

    if (invoiceJobs.length === 0) {
      return {
        invoiceId: null,
        existingInvoice: false,
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
    const addOns = await buildInvoiceAddOnSnapshot(ctx, account);
    const totals = calculateInvoiceTotals(account.contractAmountCents ?? 0, addOns.items);
    if (totals.totalCents <= 0) throw new Error("Invoice total must be greater than zero before billing");
    const invoiceId = await ctx.db.insert("invoices", {
      companyId: account.companyId,
      clientRelationshipId: account.clientRelationshipId,
      commercialAccountId: account._id,
      invoiceType: "commercial",
      title: `${account.clientName} Invoice`,
      invoiceNumber: await nextInvoiceNumber(ctx, account.companyId),
      status: "draft",
      billingStartDate: args.billingStartDate,
      billingEndDate: args.billingEndDate,
      issueDate,
      dueDate,
      ...totals,
      sourceProposalId: addOns.sourceProposalId,
      addOnLineItems: addOns.items.length ? addOns.items : undefined,
      jobIds: invoiceJobs.map((job: any) => job._id),
      notes: cleanOptional(args.notes),
      createdAt: now,
      updatedAt: now,
    });

    return {
      invoiceId,
      existingInvoice: false,
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
    sessionToken: v.string(),
    invoiceId: v.id("invoices"),
    notes: v.optional(v.string()),
    paymentDueDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { invoice } = await getOwnedInvoice(ctx, args.sessionToken, args.userId, args.invoiceId);
    if (invoice.status !== "draft") throw new Error("Only draft invoices can be edited");
    const type = assertInvoiceInvariant(invoice);
    await ctx.db.patch(args.invoiceId, { notes: cleanOptional(args.notes), ...(type === "job" && args.paymentDueDays !== undefined ? { paymentDueDays: checkedDueDays(args.paymentDueDays) } : {}), updatedAt: Date.now() });
  },
});

export const markIssued = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    invoiceId: v.id("invoices"),
  },
  handler: async (ctx, args) => {
    const { invoice } = await getOwnedInvoice(ctx, args.sessionToken, args.userId, args.invoiceId);
    if (invoice.status !== "draft") throw new Error("Only draft invoices can be issued");
    const type = assertInvoiceInvariant(invoice);
    if (!Number.isSafeInteger(invoice.totalCents) || invoice.totalCents <= 0) throw new Error("Invoice total must be greater than zero before billing");
    const now = Date.now();
    await ctx.db.patch(args.invoiceId, {
      status: "issued",
      issuedAt: now,
      ...(type === "job" ? { issueDate: formatDate(new Date(now)), dueDate: formatDate(addDays(new Date(now), invoice.paymentDueDays!)) } : {}),
      updatedAt: now,
    });
  },
});

export const markPaid = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    invoiceId: v.id("invoices"),
  },
  handler: async (ctx, args) => {
    const { invoice } = await getOwnedInvoice(ctx, args.sessionToken, args.userId, args.invoiceId);
    if (invoice.status !== "issued") throw new Error("Only issued invoices can be marked paid");
    assertInvoiceInvariant(invoice);
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
    sessionToken: v.string(),
    invoiceId: v.id("invoices"),
  },
  handler: async (ctx, args) => {
    const { invoice } = await getOwnedInvoice(ctx, args.sessionToken, args.userId, args.invoiceId);
    assertInvoiceInvariant(invoice);
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
