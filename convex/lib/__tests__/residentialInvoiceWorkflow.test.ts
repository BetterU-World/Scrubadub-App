import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import { hashPassword } from "../password";
import { checkedPriceSnapshot, resolveJobInvoiceablePricing } from "../jobPricing";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "residential-invoice-test";
beforeEach(() => { process.env.TOKEN_PEPPER = "residential-invoice-pepper"; process.env.STRIPE_SECRET_KEY = "test"; process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test"; process.env.APP_URL = "http://localhost:5173"; });

async function setup() {
  const t = convexTest(schema, modules);
  const passwordHash = await hashPassword(PASSWORD);
  const seeded = await t.run(async ctx => {
    const company = await ctx.db.insert("companies", { name: "Homes", timezone: "America/New_York" });
    const otherCompany = await ctx.db.insert("companies", { name: "Other", timezone: "America/New_York" });
    const owner = await ctx.db.insert("users", { companyId: company, role: "owner", status: "active", email: "home-owner@test.dev", name: "Owner", passwordHash });
    const manager = await ctx.db.insert("users", { companyId: company, role: "manager", status: "active", canManageInvoices: true, email: "home-manager@test.dev", name: "Manager", passwordHash });
    const viewer = await ctx.db.insert("users", { companyId: company, role: "manager", status: "active", canViewFinancials: true, email: "home-viewer@test.dev", name: "Viewer", passwordHash });
    const client = await ctx.db.insert("clientUsers", { email: "home-client@test.dev", displayName: "Client", status: "active", passwordHash, createdAt: 1, updatedAt: 1 });
    const otherClient = await ctx.db.insert("clientUsers", { email: "other-client@test.dev", displayName: "Other", status: "active", passwordHash, createdAt: 1, updatedAt: 1 });
    const relationship = await ctx.db.insert("clientRelationships", { companyId: company, clientUserId: client, displayName: "Original Bill To", email: "home-client@test.dev", clientType: "residential", status: "active", createdAt: 1, updatedAt: 1 });
    const property = await ctx.db.insert("properties", { companyId: company, clientRelationshipId: relationship, name: "Original Home", type: "residential", address: "1 Main", amenities: [], active: true });
    const snapshot = checkedPriceSnapshot(15000, [{ snapshotId: "oven", name: "Oven", amountCents: 2500, quantity: 2, unitLabel: "oven" }]);
    const job = await ctx.db.insert("jobs", { companyId: company, clientRelationshipId: relationship, propertyId: property, cleanerIds: [], type: "standard", status: "approved", scheduledDate: "2030-01-15", durationMinutes: 60, reworkCount: 0, customerChargeCents: 17500, customerPricingStatus: "accepted", customerPricingSource: "direct_quote", customerPricingRevision: 1, customerPricingSnapshot: snapshot, customerAddOnsFinalizedRevision: 1 });
    const offer = await ctx.db.insert("servicePriceOffers", { companyId: company, clientRelationshipId: relationship, jobId: job, version: 1, source: "direct_quote", snapshot, status: "accepted", createdByUserId: owner, createdAt: 1, respondedAt: 2, acceptedByClientUserId: client });
    await ctx.db.patch(job, { customerPriceOfferId: offer, customerPriceConsent: { source: "client_in_app", acceptedAt: 2, acceptedAmountCents: 17500, clientUserId: client, offerId: offer } });
    return { company, otherCompany, owner, manager, viewer, client, otherClient, relationship, property, job, offer };
  });
  const ownerSession = await t.action(api.authActions.signIn, { email: "home-owner@test.dev", password: PASSWORD });
  const managerSession = await t.action(api.authActions.signIn, { email: "home-manager@test.dev", password: PASSWORD });
  const viewerSession = await t.action(api.authActions.signIn, { email: "home-viewer@test.dev", password: PASSWORD });
  const clientSession = await t.action(api.clientAuthActions.signIn, { email: "home-client@test.dev", password: PASSWORD });
  const otherClientSession = await t.action(api.clientAuthActions.signIn, { email: "other-client@test.dev", password: PASSWORD });
  return { t, ...seeded, ownerAuth: { userId: seeded.owner, sessionToken: ownerSession.sessionToken }, managerAuth: { userId: seeded.manager, sessionToken: managerSession.sessionToken }, viewerAuth: { userId: seeded.viewer, sessionToken: viewerSession.sessionToken }, clientAuth: { clientUserId: seeded.client, sessionToken: clientSession.sessionToken }, otherClientAuth: { clientUserId: seeded.otherClient, sessionToken: otherClientSession.sessionToken } };
}

describe("residential single-job invoices", () => {
  it("freezes an invoice, issues with actual issue-day terms, and keeps draft private", async () => {
    const s = await setup();
    const id = await s.t.mutation(api.mutations.invoices.createFromJob, { ...s.ownerAuth, jobId: s.job, paymentDueDays: 7 });
    const draft = await s.t.run(ctx => ctx.db.get(id));
    expect(draft).toMatchObject({ invoiceType: "job", sourceJobId: s.job, status: "draft", totalCents: 17500, taxCents: 0, paymentDueDays: 7, billToSnapshot: { displayName: "Original Bill To" }, serviceSnapshot: { locationName: "Original Home" } });
    expect(draft?.issueDate).toBeUndefined();
    expect(draft?.dueDate).toBeUndefined();
    expect((await s.t.query(api.queries.clientPortal.getClientBilling, s.clientAuth)).invoices).toHaveLength(0);
    await s.t.run(async ctx => { await ctx.db.patch(s.relationship, { displayName: "New Name" }); await ctx.db.patch(s.property, { name: "New Home" }); });
    expect((await s.t.run(ctx => ctx.db.get(id)))?.billToSnapshot?.displayName).toBe("Original Bill To");
    await s.t.mutation(api.mutations.invoices.markIssued, { ...s.ownerAuth, invoiceId: id });
    const issued = await s.t.run(ctx => ctx.db.get(id));
    expect(issued?.status).toBe("issued");
    expect((Date.parse(`${issued?.dueDate}T00:00:00Z`) - Date.parse(`${issued?.issueDate}T00:00:00Z`)) / 86400000).toBe(7);
    expect((await s.t.query(api.queries.clientPortal.getClientBilling, s.clientAuth)).invoices).toHaveLength(1);
    expect((await s.t.query(api.queries.clientPortal.getClientBilling, s.otherClientAuth)).invoices).toHaveLength(0);
    await expect(s.t.query(internal.invoiceDeliveryInternal.getForClientPayment, { clientUserId: s.client, invoiceId: id })).rejects.toThrow("not available yet");
  });

  it("reuses a draft, blocks issued duplicates, and permits a new numbered invoice after void", async () => {
    const s = await setup();
    const first = await s.t.mutation(api.mutations.invoices.createFromJob, { ...s.ownerAuth, jobId: s.job });
    expect(await s.t.mutation(api.mutations.invoices.createFromJob, { ...s.managerAuth, jobId: s.job })).toBe(first);
    await s.t.mutation(api.mutations.invoices.markIssued, { ...s.ownerAuth, invoiceId: first });
    await expect(s.t.mutation(api.mutations.invoices.createFromJob, { ...s.ownerAuth, jobId: s.job })).rejects.toThrow("already has an invoice");
    await s.t.mutation(api.mutations.invoices.voidInvoice, { ...s.ownerAuth, invoiceId: first });
    const second = await s.t.mutation(api.mutations.invoices.createFromJob, { ...s.ownerAuth, jobId: s.job });
    expect(second).not.toBe(first);
    expect((await s.t.run(ctx => ctx.db.get(second)))?.invoiceNumber).not.toBe((await s.t.run(ctx => ctx.db.get(first)))?.invoiceNumber);
    expect(await s.t.run(ctx => resolveJobInvoiceablePricing(ctx, s.job, s.company))).toMatchObject({ reason: "already_invoiced" });
  });

  it("enforces permission, company, consent, and due-term bounds", async () => {
    const s = await setup();
    await expect(s.t.mutation(api.mutations.invoices.createFromJob, { ...s.viewerAuth, jobId: s.job })).rejects.toThrow("canManageInvoices");
    await expect(s.t.mutation(api.mutations.invoices.createFromJob, { ...s.ownerAuth, jobId: s.job, paymentDueDays: -1 })).rejects.toThrow("0 and 365");
    await expect(s.t.mutation(api.mutations.invoices.createFromJob, { ...s.ownerAuth, jobId: s.job, paymentDueDays: 366 })).rejects.toThrow("0 and 365");
    await s.t.run(ctx => ctx.db.patch(s.relationship, { clientUserId: s.otherClient }));
    expect(await s.t.run(ctx => resolveJobInvoiceablePricing(ctx, s.job, s.company))).toMatchObject({ reason: "invalid_snapshot" });
    await expect(s.t.mutation(api.mutations.invoices.createFromJob, { ...s.ownerAuth, jobId: s.job })).rejects.toThrow("not ready");
  });

  it("rejects changed frozen offer lines even when the total is unchanged", async () => {
    const s = await setup();
    const job = (await s.t.run(ctx => ctx.db.get(s.job)))!;
    await s.t.run(ctx => ctx.db.patch(s.job, { customerPricingSnapshot: { ...job.customerPricingSnapshot!, addOns: [{ ...job.customerPricingSnapshot!.addOns[0], name: "Different work" }] } }));
    expect(await s.t.run(ctx => resolveJobInvoiceablePricing(ctx, s.job, s.company))).toMatchObject({ reason: "invalid_snapshot" });
    await expect(s.t.mutation(api.mutations.invoices.createFromJob, { ...s.ownerAuth, jobId: s.job })).rejects.toThrow("not ready");
  });

  it("rejects unapproved, pending, inactive, foreign, and commercial jobs", async () => {
    const s = await setup();
    await s.t.run(ctx => ctx.db.patch(s.job, { status: "submitted" }));
    await expect(s.t.mutation(api.mutations.invoices.createFromJob, { ...s.ownerAuth, jobId: s.job })).rejects.toThrow("not_approved");
    await s.t.run(ctx => ctx.db.patch(s.job, { status: "approved", customerPricingStatus: "pending" }));
    await expect(s.t.mutation(api.mutations.invoices.createFromJob, { ...s.ownerAuth, jobId: s.job })).rejects.toThrow("price_pending");
    await s.t.run(ctx => ctx.db.patch(s.job, { customerPricingStatus: "accepted" }));
    await s.t.run(ctx => ctx.db.patch(s.relationship, { status: "inactive" }));
    await expect(s.t.mutation(api.mutations.invoices.createFromJob, { ...s.ownerAuth, jobId: s.job })).rejects.toThrow("missing_relationship");
    await s.t.run(ctx => ctx.db.patch(s.relationship, { status: "active" }));
    const foreign = await s.t.run(ctx => ctx.db.insert("jobs", { companyId: s.otherCompany, cleanerIds: [], type: "standard", status: "approved", scheduledDate: "2030-01-01", durationMinutes: 60, reworkCount: 0 }));
    await expect(s.t.mutation(api.mutations.invoices.createFromJob, { ...s.ownerAuth, jobId: foreign })).rejects.toThrow("Access denied");
    const account = await s.t.run(ctx => ctx.db.insert("commercialAccounts", { companyId: s.company, clientRelationshipId: s.relationship, clientName: "Client", contractAmountCents: 10000, status: "active", createdAt: 1, updatedAt: 1 }));
    await s.t.run(ctx => ctx.db.patch(s.job, { commercialAccountId: account }));
    await expect(s.t.mutation(api.mutations.invoices.createFromJob, { ...s.ownerAuth, jobId: s.job })).rejects.toThrow("Commercial jobs");
  });

  it("lets an invoice Manager issue and record outside payment while a financial viewer stays read-only", async () => {
    const s = await setup();
    const id = await s.t.mutation(api.mutations.invoices.createFromJob, { ...s.managerAuth, jobId: s.job });
    expect((await s.t.query(api.queries.invoices.getById, { ...s.viewerAuth, invoiceId: id }))?.invoiceType).toBe("job");
    await expect(s.t.mutation(api.mutations.invoices.markIssued, { ...s.viewerAuth, invoiceId: id })).rejects.toThrow("canManageInvoices");
    await s.t.mutation(api.mutations.invoices.updateDraft, { ...s.managerAuth, invoiceId: id, paymentDueDays: 0 });
    await s.t.mutation(api.mutations.invoices.markIssued, { ...s.managerAuth, invoiceId: id });
    const issued = await s.t.run(ctx => ctx.db.get(id));
    expect(issued?.dueDate).toBe(issued?.issueDate);
    await s.t.mutation(api.mutations.invoices.markPaid, { ...s.managerAuth, invoiceId: id });
    expect((await s.t.run(ctx => ctx.db.get(id)))?.status).toBe("paid");
    await expect(s.t.mutation(api.mutations.invoices.voidInvoice, { ...s.managerAuth, invoiceId: id })).rejects.toThrow("Paid invoices cannot be voided");
  });
});
