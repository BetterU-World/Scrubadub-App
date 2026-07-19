import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import { hashPassword } from "../password";
import { calculateInvoiceTotals, publicInvoiceAddOns } from "../invoiceAddOnLineItems";
import { renderInvoiceEmail } from "../email";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "test-password-123";

beforeEach(() => {
  process.env.TOKEN_PEPPER = "invoice-addon-pepper";
  process.env.STRIPE_SECRET_KEY = "test-stripe-key";
  process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.RESEND_FROM_EMAIL = "test@example.com";
  process.env.APP_URL = "http://localhost:5173";
});

async function setup() {
  const t = convexTest(schema, modules);
  const passwordHash = await hashPassword(PASSWORD);
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Invoice Co", timezone: "America/New_York", stripeConnectAccountId: "acct_test" });
    const otherCompanyId = await ctx.db.insert("companies", { name: "Other", timezone: "America/New_York" });
    const ownerId = await ctx.db.insert("users", { email: "invoice-owner@test.dev", passwordHash, name: "Owner", companyId, role: "owner", status: "active" });
    const otherOwnerId = await ctx.db.insert("users", { email: "other-invoice-owner@test.dev", passwordHash, name: "Other", companyId: otherCompanyId, role: "owner", status: "active" });
    const clientUserId = await ctx.db.insert("clientUsers", { email: "invoice-client@test.dev", passwordHash, displayName: "Client", status: "active", createdAt: 1, updatedAt: 1 });
    const relationshipId = await ctx.db.insert("clientRelationships", { companyId, clientUserId, displayName: "Client", email: "invoice-client@test.dev", clientType: "commercial", status: "active", createdAt: 1, updatedAt: 1 });
    const requestId = await ctx.db.insert("clientRequests", { companyId, clientRelationshipId: relationshipId, createdAt: 1, status: "accepted", requesterName: "Client", requesterEmail: "invoice-client@test.dev", propertySnapshot: {}, source: "manual", leadType: "commercial", leadStage: "accepted" });
    const proposalId = await ctx.db.insert("proposals", { companyId, clientRelationshipId: relationshipId, clientRequestId: requestId, createdByUserId: ownerId, title: "Accepted", clientName: "Client", status: "accepted", monthlyPriceCents: 10000, addOnLineItems: [
      { lineItemId: "flat", sourceType: "custom", name: "Monthly flat", pricingMethod: "flat", unitPriceCents: 1000, billingCadence: "monthly" },
      { lineItemId: "units", sourceType: "custom", name: "Three units", pricingMethod: "per_unit", unitPriceCents: 200, unitLabel: "unit", quantity: 3, billingCadence: "monthly" },
      { lineItemId: "starting", sourceType: "custom", name: "Setup", pricingMethod: "starting_at", unitPriceCents: 1500, finalizedPriceCents: 2500, billingCadence: "one_time" },
    ], createdAt: 1, updatedAt: 1 });
    const accountId = await ctx.db.insert("commercialAccounts", { companyId, clientRelationshipId: relationshipId, clientRequestId: requestId, sourceProposalId: proposalId, clientName: "Client", contractAmountCents: 10000, status: "active", createdAt: 1, updatedAt: 1 });
    const manualAccountId = await ctx.db.insert("commercialAccounts", { companyId, clientRelationshipId: relationshipId, clientName: "Manual", contractAmountCents: 5000, status: "active", createdAt: 1, updatedAt: 1 });
    const job1 = await ctx.db.insert("jobs", { companyId, clientRelationshipId: relationshipId, commercialAccountId: accountId, cleanerIds: [], type: "standard", status: "approved", scheduledDate: "2030-01-15", durationMinutes: 60, reworkCount: 0 });
    const job2 = await ctx.db.insert("jobs", { companyId, clientRelationshipId: relationshipId, commercialAccountId: accountId, cleanerIds: [], type: "standard", status: "approved", scheduledDate: "2030-02-15", durationMinutes: 60, reworkCount: 0 });
    const manualJob = await ctx.db.insert("jobs", { companyId, clientRelationshipId: relationshipId, commercialAccountId: manualAccountId, cleanerIds: [], type: "standard", status: "approved", scheduledDate: "2030-01-20", durationMinutes: 60, reworkCount: 0 });
    return { companyId, otherCompanyId, ownerId, otherOwnerId, clientUserId, relationshipId, proposalId, accountId, manualAccountId, job1, job2, manualJob };
  });
  const owner = await t.action(api.authActions.signIn, { email: "invoice-owner@test.dev", password: PASSWORD });
  const other = await t.action(api.authActions.signIn, { email: "other-invoice-owner@test.dev", password: PASSWORD });
  const client = await t.action(api.clientAuthActions.signIn, { email: "invoice-client@test.dev", password: PASSWORD });
  return { t, ...ids, ownerAuth: { userId: ids.ownerId, sessionToken: owner.sessionToken }, otherAuth: { userId: ids.otherOwnerId, sessionToken: other.sessionToken }, clientToken: client.sessionToken };
}

describe("invoice add-on line items", () => {
  it("copies authoritative flat, per-unit, and finalized starting-at values and freezes history", async () => {
    const s = await setup();
    const first: any = await s.t.mutation(api.mutations.invoices.generateFromJobs, { ...s.ownerAuth, commercialAccountId: s.accountId, billingStartDate: "2030-01-01", billingEndDate: "2030-01-31" });
    const invoice: any = await s.t.run((ctx) => ctx.db.get(first.invoiceId));
    expect(invoice).toMatchObject({ baseSubtotalCents: 10000, addOnSubtotalCents: 4100, subtotalCents: 14100, totalCents: 14100, sourceProposalId: s.proposalId });
    expect(invoice.addOnLineItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceProposalLineItemId: "flat", pricingMethod: "flat", lineTotalCents: 1000 }),
      expect.objectContaining({ sourceProposalLineItemId: "units", unitPriceCents: 200, quantity: 3, lineTotalCents: 600 }),
      expect.objectContaining({ sourceProposalLineItemId: "starting", finalizedPriceCents: 2500, lineTotalCents: 2500 }),
    ]));
    await s.t.run((ctx) => ctx.db.patch(s.proposalId, { addOnLineItems: [] }));
    expect((await s.t.run((ctx) => ctx.db.get(first.invoiceId)))!.addOnLineItems).toHaveLength(3);
  });

  it("includes monthly lines again but consumes one-time lines exactly once across retries", async () => {
    const s = await setup();
    const january: any = await s.t.mutation(api.mutations.invoices.generateFromJobs, { ...s.ownerAuth, commercialAccountId: s.accountId, billingStartDate: "2030-01-01", billingEndDate: "2030-01-31" });
    const retry: any = await s.t.mutation(api.mutations.invoices.generateFromJobs, { ...s.ownerAuth, commercialAccountId: s.accountId, billingStartDate: "2030-01-01", billingEndDate: "2030-01-31" });
    expect(retry).toMatchObject({ invoiceId: january.invoiceId, existingInvoice: true });
    await s.t.mutation(api.mutations.invoices.markIssued, { ...s.ownerAuth, invoiceId: january.invoiceId });
    const february: any = await s.t.mutation(api.mutations.invoices.generateFromJobs, { ...s.ownerAuth, commercialAccountId: s.accountId, billingStartDate: "2030-02-01", billingEndDate: "2030-02-28" });
    const invoice: any = await s.t.run((ctx) => ctx.db.get(february.invoiceId));
    expect(invoice.addOnLineItems.map((line: any) => line.sourceProposalLineItemId)).toEqual(["flat", "units"]);
    expect(invoice.totalCents).toBe(11600);
  });

  it("preserves manual and legacy invoices and enforces company scope", async () => {
    const s = await setup();
    const manualId = await s.t.mutation(api.mutations.invoices.create, { ...s.ownerAuth, commercialAccountId: s.manualAccountId, title: "Manual", billingStartDate: "2030-01-01", billingEndDate: "2030-01-31", issueDate: "2030-01-31", dueDate: "2030-02-28", jobIds: [s.manualJob] });
    const manual: any = await s.t.run((ctx) => ctx.db.get(manualId));
    expect(manual).toMatchObject({ totalCents: 5000, addOnSubtotalCents: 0 });
    expect(manual.addOnLineItems).toBeUndefined();
    const legacyId = await s.t.run((ctx) => ctx.db.insert("invoices", { companyId: s.companyId, clientRelationshipId: s.relationshipId, commercialAccountId: s.manualAccountId, title: "Legacy", invoiceNumber: "OLD", status: "issued", billingStartDate: "2029-01-01", billingEndDate: "2029-01-31", issueDate: "2029-01-31", dueDate: "2029-02-28", subtotalCents: 7000, taxCents: 0, totalCents: 7000, jobIds: [], createdAt: 1, updatedAt: 1 }));
    await expect(s.t.query(api.queries.invoices.getById, { ...s.otherAuth, invoiceId: legacyId })).rejects.toThrow("Access denied");
    expect((await s.t.query(api.queries.invoices.getById, { ...s.ownerAuth, invoiceId: legacyId }) as any).computedTotals.totalCents).toBe(7000);
  });

  it("sanitizes client and delivery payloads and verifies checkout totals", async () => {
    const s = await setup();
    const created: any = await s.t.mutation(api.mutations.invoices.generateFromJobs, { ...s.ownerAuth, commercialAccountId: s.accountId, billingStartDate: "2030-01-01", billingEndDate: "2030-01-31" });
    await s.t.mutation(api.mutations.invoices.markIssued, { ...s.ownerAuth, invoiceId: created.invoiceId });
    const home: any = await s.t.query(api.queries.clientHome.getClientHome, { clientUserId: s.clientUserId, sessionToken: s.clientToken });
    expect(home.invoices[0].totalCents).toBe(14100);
    expect(JSON.stringify(home.invoices[0].addOnLineItems)).not.toMatch(/sourceProposal/);
    const payment: any = await s.t.query((internal as any).invoiceDeliveryInternal.getForClientPayment, { clientUserId: s.clientUserId, invoiceId: created.invoiceId });
    expect(payment.totalCents).toBe(14100);
    expect(JSON.stringify(payment)).not.toMatch(/addOnLineItems|sourceProposal/);
  });

  it("rejects unsafe arithmetic and renders email and responsive accessible localized UI", () => {
    expect(() => calculateInvoiceTotals(Number.MAX_SAFE_INTEGER, [])).toThrow("safe whole-cent");
    expect(() => calculateInvoiceTotals(1_000_000_000, [{ lineTotalCents: 1 } as any])).toThrow("supported bounds");
    expect(publicInvoiceAddOns([{ snapshotId: "s", sourceProposalId: "p", sourceProposalLineItemId: "l", name: "Add", pricingMethod: "flat", unitPriceCents: 100, billingCadence: "monthly", lineTotalCents: 100 } as any])[0]).not.toHaveProperty("sourceProposalId");
    const email = renderInvoiceEmail({ recipientEmail: "client@test.dev", clientName: "Client", companyName: "Co", viewUrl: "https://example.test", invoice: { invoiceNumber: "INV-1", title: "Invoice", dueDate: "2030-01-01", baseSubtotalCents: 1000, addOnSubtotalCents: 100, totalCents: 1100, addOnLineItems: [{ name: "Add", lineTotalCents: 100 }] } });
    expect(email.html).toContain("Add"); expect(email.html).toContain("$11.00");
    const component = readFileSync(fileURLToPath(new URL("../../../packages/frontend/src/components/AddOnSnapshotList.tsx", import.meta.url)), "utf8");
    const en = JSON.parse(readFileSync(fileURLToPath(new URL("../../../packages/frontend/src/i18n/en/common.json", import.meta.url)), "utf8"));
    const es = JSON.parse(readFileSync(fileURLToPath(new URL("../../../packages/frontend/src/i18n/es/common.json", import.meta.url)), "utf8"));
    expect(component).toContain("aria-labelledby"); expect(component).toContain("sm:flex-row");
    expect(en.invoices.addOnSubtotal).toBeTruthy(); expect(es.invoices.payOnline).toBeTruthy();
  });
});
