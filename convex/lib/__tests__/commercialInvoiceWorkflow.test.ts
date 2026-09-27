import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import { hashPassword } from "../password";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "test-password-123";

beforeEach(() => {
  process.env.TOKEN_PEPPER = "invoice-workflow-test";
  process.env.APP_URL = "http://localhost:5173";
  process.env.STRIPE_SECRET_KEY = "test";
  process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test";
});

async function setup(price = 10000) {
  const t = convexTest(schema, modules);
  const passwordHash = await hashPassword(PASSWORD);
  const ids = await t.run(async ctx => {
    const company = await ctx.db.insert("companies", { name: "Billing Co", timezone: "America/New_York" });
    const owner = await ctx.db.insert("users", { email: "bill-owner@test.dev", passwordHash, name: "Owner", companyId: company, role: "owner", status: "active" });
    const manager = await ctx.db.insert("users", { email: "bill-manager@test.dev", passwordHash, name: "Manager", companyId: company, role: "manager", status: "active", canSeeAllJobs: true, canManageInvoices: true });
    const otherManager = await ctx.db.insert("users", { email: "bill-other@test.dev", passwordHash, name: "Other", companyId: company, role: "manager", status: "active", canSeeAllJobs: true });
    const client = await ctx.db.insert("clientUsers", { email: "bill-client@test.dev", passwordHash, displayName: "Client", status: "active", createdAt: 1, updatedAt: 1 });
    const relationship = await ctx.db.insert("clientRelationships", { companyId: company, clientUserId: client, email: "bill-client@test.dev", displayName: "Client", clientType: "commercial", status: "active", createdAt: 1, updatedAt: 1 });
    const account = await ctx.db.insert("commercialAccounts", { companyId: company, clientRelationshipId: relationship, clientName: "Client", contractAmountCents: price, status: "active", createdAt: 1, updatedAt: 1 });
    const approved = await ctx.db.insert("jobs", { companyId: company, clientRelationshipId: relationship, commercialAccountId: account, cleanerIds: [], type: "standard", status: "approved", scheduledDate: "2030-01-15", durationMinutes: 60, reworkCount: 0 });
    const second = await ctx.db.insert("jobs", { companyId: company, clientRelationshipId: relationship, commercialAccountId: account, cleanerIds: [], type: "standard", status: "approved", scheduledDate: "2030-01-22", durationMinutes: 60, reworkCount: 0 });
    const unapproved = await ctx.db.insert("jobs", { companyId: company, clientRelationshipId: relationship, commercialAccountId: account, cleanerIds: [], type: "standard", status: "scheduled", scheduledDate: "2030-01-23", durationMinutes: 60, reworkCount: 0 });
    const residential = await ctx.db.insert("jobs", { companyId: company, clientRelationshipId: relationship, cleanerIds: [], type: "standard", status: "approved", scheduledDate: "2030-01-24", durationMinutes: 60, reworkCount: 0 });
    return { company, owner, manager, otherManager, client, relationship, account, approved, second, unapproved, residential };
  });
  const ownerAuth = await t.action(api.authActions.signIn, { email: "bill-owner@test.dev", password: PASSWORD });
  const managerAuth = await t.action(api.authActions.signIn, { email: "bill-manager@test.dev", password: PASSWORD });
  const otherAuth = await t.action(api.authActions.signIn, { email: "bill-other@test.dev", password: PASSWORD });
  const clientAuth = await t.action(api.clientAuthActions.signIn, { email: "bill-client@test.dev", password: PASSWORD });
  return { t, ...ids, ownerArgs: { userId: ids.owner, sessionToken: ownerAuth.sessionToken }, managerArgs: { userId: ids.manager, sessionToken: managerAuth.sessionToken }, otherArgs: { userId: ids.otherManager, sessionToken: otherAuth.sessionToken }, clientArgs: { clientUserId: ids.client, sessionToken: clientAuth.sessionToken } };
}

describe("commercial invoice workflow", () => {
  it("projects the complete client lifecycle and canonical owner evidence without client Stripe internals", async () => {
    const s = await setup(2500);
    process.env.APP_URL = "https://scrub.test";
    process.env.STRIPE_SECRET_KEY = "sk_test_fixture";
    await s.t.run(ctx => ctx.db.patch(s.company, { stripeConnectArchitecture: "merchant_direct_v2", stripeConnectAccountId: "acct_company" }));
    const created = await s.t.mutation(api.mutations.invoices.generateFromJobs, { ...s.ownerArgs, commercialAccountId: s.account, billingStartDate: "2030-01-01", billingEndDate: "2030-01-31" });
    const invoiceId = created.invoiceId!;
    await s.t.mutation(api.mutations.invoices.markIssued, { ...s.ownerArgs, invoiceId });
    const billing = async () => (await s.t.query(api.queries.clientPortal.getClientBilling, s.clientArgs)).invoices[0];
    const owner = () => s.t.query(api.queries.invoices.getById, { ...s.ownerArgs, invoiceId });
    expect(await billing()).toMatchObject({ paymentState: "payable", canPayOnline: true });
    const attemptId = await s.t.mutation((internal as any).invoicePaymentInternal.reserve, { invoiceId, clientUserId: s.client, connectedStripeAccountId: "acct_company" });
    expect(await billing()).toMatchObject({ status: "issued", paymentState: "processing", canPayOnline: false });
    for (const status of ["failed", "expired", "reconciliation_required"] as const) {
      await s.t.run(ctx => ctx.db.patch(attemptId, { status }));
      expect(await billing()).toMatchObject({ status: "issued", paymentState: status === "reconciliation_required" ? "attention" : status, canPayOnline: status !== "reconciliation_required" });
    }
    await s.t.run(ctx => ctx.db.patch(attemptId, { status: "creating" }));
    await s.t.mutation((internal as any).invoicePaymentInternal.opened, { attemptId, sessionId: "cs_canonical", url: "https://checkout.test" });
    const amount = (await billing()).totalCents;
    expect(await s.t.mutation((internal as any).invoicePaymentInternal.applySuccess, { attemptId, sessionId: "cs_canonical", paymentIntentId: "pi_canonical", amountCents: amount, currency: "usd", feeCents: 0, destination: "", eventAccount: "acct_company", eventSource: "connect", invoiceIdMetadata: String(invoiceId), companyIdMetadata: String(s.company) })).toBe("paid");
    expect(await billing()).toMatchObject({ status: "paid", paymentState: "paid", paymentSource: "online", canPayOnline: false });
    expect(JSON.stringify(await billing())).not.toMatch(/pi_canonical|cs_canonical|acct_company|checkout\.test/);
    expect((await owner())?.paymentRecord).toMatchObject({ state: "paid", source: "online", platformFeeCents: 0, references: { paymentIntentId: "pi_canonical", chargeModel: "direct" } });
    expect((await s.t.query(api.queries.invoices.getById, { ...s.managerArgs, invoiceId }))?.paymentRecord?.references).toBeNull();
    await s.t.run(ctx => ctx.db.patch(s.otherManager, { canViewFinancials: true }));
    expect((await s.t.query(api.queries.invoices.getById, { ...s.otherArgs, invoiceId }))?.paymentRecord?.references?.paymentIntentId).toBe("pi_canonical");
    await s.t.run(ctx => ctx.db.patch(s.otherManager, { canViewFinancials: false }));
    await expect(s.t.query(api.queries.invoices.getById, { ...s.otherArgs, invoiceId })).rejects.toThrow("Invoice access required");
    await s.t.mutation((internal as any).invoicePaymentInternal.recordFinancialEvent, { stripeEventId: "evt_refund", eventType: "charge.refunded", objectId: "ch_canonical", paymentIntentId: "pi_canonical", eventAccount: "acct_company", source: "connect" });
    await s.t.mutation((internal as any).invoicePaymentInternal.recordFinancialEvent, { stripeEventId: "evt_dispute", eventType: "charge.dispute.closed", objectId: "dp_canonical", paymentIntentId: "pi_canonical", eventAccount: "acct_company", source: "connect" });
    await s.t.mutation((internal as any).invoicePaymentInternal.recordFinancialEvent, { stripeEventId: "evt_wrong", eventType: "charge.dispute.created", objectId: "dp_wrong", paymentIntentId: "pi_canonical", eventAccount: "acct_wrong", source: "connect" });
    const record = (await owner())?.paymentRecord;
    expect(record).toMatchObject({ state: "paid", hasRefundEvidence: true, hasDisputeEvidence: true });
    expect(record?.history.filter((e: any) => e.kind.startsWith("charge.")).map((e: any) => e.kind).sort()).toEqual(["charge.dispute.closed", "charge.refunded"]);
    expect(JSON.stringify(record)).not.toMatch(/dp_wrong|evt_wrong|stripeCheckoutUrl|exceptionReason/);
    await s.t.mutation((internal as any).invoicePaymentInternal.recordException, { sessionId: "cs_conflict", invoiceIdCandidate: String(invoiceId), companyIdCandidate: String(s.company), reason: "paid_attempt_identity_conflict" });
    expect(await billing()).toMatchObject({ status: "paid", paymentNeedsAttention: true, canPayOnline: false });
    expect((await owner())?.paymentRecord).toMatchObject({ state: "paid", needsAttention: true });
  });

  it("projects the canonical frozen fee, including historical and outside payments", async () => {
    const s = await setup();
    for (const [amount, fee, model] of [[2500, 0, "direct"], [2999, 0, "direct"], [3000, 200, "direct"], [50000, 200, "direct"], [2500, 200, undefined]] as const) {
      const invoiceId = await s.t.run(async ctx => {
        const invoiceId = await ctx.db.insert("invoices", { companyId: s.company, clientRelationshipId: s.relationship, commercialAccountId: s.account, title: "Fee display", invoiceNumber: "FEE", status: "paid", paymentSource: "online", billingStartDate: "2030-01-01", billingEndDate: "2030-01-31", issueDate: "2030-02-01", dueDate: "2030-03-01", subtotalCents: amount, taxCents: 0, totalCents: amount, jobIds: [], createdAt: 1, updatedAt: 1 });
        const attemptId = await ctx.db.insert("invoicePaymentAttempts", { companyId: s.company, invoiceId, clientRelationshipId: s.relationship, invoiceType: "commercial", amountCents: amount, currency: "usd", chargeModel: model, platformFeeCents: fee, status: "paid", createdAt: 1, updatedAt: 1 });
        await ctx.db.patch(invoiceId, { canonicalPaymentAttemptId: attemptId });
        // A noncanonical attempt must never override the frozen canonical fee.
        await ctx.db.insert("invoicePaymentAttempts", { companyId: s.company, invoiceId, clientRelationshipId: s.relationship, invoiceType: "commercial", amountCents: amount, currency: "usd", platformFeeCents: 999, status: "failed", createdAt: 1, updatedAt: 1 });
        return invoiceId;
      });
      const query = () => s.t.query(api.queries.invoices.getById, { ...s.ownerArgs, invoiceId });
      expect((await query())?.onlinePayment?.platformFeeCents).toBe(fee);
      await s.t.run(ctx => ctx.db.patch(invoiceId, { canonicalPaymentAttemptId: undefined }));
      expect((await query())?.onlinePayment?.platformFeeCents).toBeNull();
      await s.t.run(ctx => ctx.db.patch(invoiceId, { paymentSource: "outside" }));
      expect((await query())?.onlinePayment).toBeNull();
    }
  });

  it("reactively projects only issued invoices with creating/open attempts as processing", async () => {
    const s = await setup();
    const { invoiceId, attemptId } = await s.t.run(async ctx => {
      const invoiceId = await ctx.db.insert("invoices", { companyId: s.company, clientRelationshipId: s.relationship, commercialAccountId: s.account, title: "Pending display", invoiceNumber: "PENDING", status: "issued", billingStartDate: "2030-01-01", billingEndDate: "2030-01-31", issueDate: "2030-02-01", dueDate: "2030-03-01", subtotalCents: 10000, taxCents: 0, totalCents: 10000, jobIds: [], createdAt: 1, updatedAt: 1 });
      const attemptId = await ctx.db.insert("invoicePaymentAttempts", { companyId: s.company, invoiceId, clientRelationshipId: s.relationship, invoiceType: "commercial", amountCents: 10000, currency: "usd", platformFeeCents: 200, status: "creating", createdAt: 1, updatedAt: 1 });
      return { invoiceId, attemptId };
    });
    for (const status of ["creating", "open", "failed", "expired", "reconciliation_required"] as const) {
      await s.t.run(ctx => ctx.db.patch(attemptId, { status }));
      const result = await s.t.query(api.queries.clientPortal.getClientBilling, s.clientArgs);
      expect(result.invoices[0].paymentProcessing).toBe(status === "creating" || status === "open");
      expect(result.invoices[0].status).toBe("issued");
      expect(JSON.stringify(result)).not.toContain(String(attemptId));
    }
    await s.t.run(async ctx => {
      await ctx.db.patch(attemptId, { status: "open" });
      await ctx.db.patch(invoiceId, { status: "paid" });
    });
    const paid = (await s.t.query(api.queries.clientPortal.getClientBilling, s.clientArgs)).invoices[0];
    expect(paid).toMatchObject({ status: "paid", paymentProcessing: false });
  });

  it("shows only issued and paid invoices in both client projections", async () => {
    const s = await setup();
    await s.t.run(async ctx => {
      for (const status of ["draft", "issued", "paid", "void"] as const) {
        await ctx.db.insert("invoices", { companyId: s.company, clientRelationshipId: s.relationship, commercialAccountId: s.account, title: status, invoiceNumber: status, status, billingStartDate: "2030-01-01", billingEndDate: "2030-01-31", issueDate: "2030-01-31", dueDate: "2030-02-28", subtotalCents: 10000, taxCents: 0, totalCents: 10000, jobIds: [], createdAt: 1, updatedAt: 1 });
      }
    });
    const billing = await s.t.query(api.queries.clientPortal.getClientBilling, s.clientArgs);
    const home = await s.t.query(api.queries.clientHome.getClientHome, s.clientArgs);
    expect(billing.invoices.map(x => x.status).sort()).toEqual(["issued", "paid"]);
    expect(home.invoices.map(x => x.status).sort()).toEqual(["issued", "paid"]);
  });

  it("distinguishes commercial eligibility and finds the existing invoice", async () => {
    const s = await setup();
    const lookup = api.queries.invoices.getBillingForJob;
    expect(await s.t.query(lookup, { ...s.ownerArgs, jobId: s.residential })).toEqual({ kind: "non_commercial" });
    expect((await s.t.query(lookup, { ...s.ownerArgs, jobId: s.unapproved }) as any).jobStatus).toBe("scheduled");
    expect((await s.t.query(lookup, { ...s.ownerArgs, jobId: s.approved }) as any).existingInvoice).toBeNull();
    const generated = await s.t.mutation(api.mutations.invoices.generateFromJobs, { ...s.ownerArgs, commercialAccountId: s.account, billingStartDate: "2030-01-01", billingEndDate: "2030-01-31" });
    expect(generated.jobsIncluded.map(x => x.jobId).sort()).toEqual([s.approved, s.second].sort());
    expect(generated.jobsSkipped.some(x => x.jobId === s.unapproved && x.reason === "not_completed")).toBe(true);
    expect((await s.t.query(lookup, { ...s.ownerArgs, jobId: s.approved }) as any).existingInvoice._id).toBe(generated.invoiceId);
    const again = await s.t.mutation(api.mutations.invoices.generateFromJobs, { ...s.ownerArgs, commercialAccountId: s.account, billingStartDate: "2030-01-01", billingEndDate: "2030-01-31" });
    expect(again).toMatchObject({ existingInvoice: true, invoiceId: generated.invoiceId });
    expect((await s.t.run(async ctx => ctx.db.query("invoices").collect())).length).toBe(1);
  });

  it("allows an invoice manager without sales permission and rejects other managers", async () => {
    const s = await setup();
    const lookup = api.queries.invoices.getBillingForJob;
    expect((await s.t.query(lookup, { ...s.managerArgs, jobId: s.approved }) as any).kind).toBe("commercial");
    await expect(s.t.query(lookup, { ...s.otherArgs, jobId: s.approved })).rejects.toThrow("Invoice access required");
    const created = await s.t.mutation(api.mutations.invoices.generateFromJobs, { ...s.managerArgs, commercialAccountId: s.account, billingStartDate: "2030-01-01", billingEndDate: "2030-01-31" });
    expect(created.invoiceId).toBeTruthy();
    await expect(s.t.mutation(api.mutations.invoices.markIssued, { ...s.otherArgs, invoiceId: created.invoiceId! })).rejects.toThrow("canManageInvoices");
  });

  it("issuing publishes without sending and delivery requires portal access and email", async () => {
    const s = await setup();
    const created = await s.t.mutation(api.mutations.invoices.generateFromJobs, { ...s.ownerArgs, commercialAccountId: s.account, billingStartDate: "2030-01-01", billingEndDate: "2030-01-31" });
    await s.t.mutation(api.mutations.invoices.markIssued, { ...s.ownerArgs, invoiceId: created.invoiceId! });
    expect((await s.t.run(async ctx => ctx.db.get(created.invoiceId!)))?.sentAt).toBeUndefined();
    expect((await s.t.query(api.queries.clientPortal.getClientBilling, s.clientArgs)).invoices).toHaveLength(1);
    const preflight = internal.invoiceDeliveryInternal.getForOwnerDelivery;
    await s.t.run(async ctx => ctx.db.patch(s.relationship, { clientUserId: undefined }));
    await expect(s.t.query(preflight, { companyId: s.company, invoiceId: created.invoiceId! })).rejects.toThrow("portal access");
    await s.t.run(async ctx => ctx.db.patch(s.relationship, { clientUserId: s.client, email: undefined }));
    await expect(s.t.query(preflight, { companyId: s.company, invoiceId: created.invoiceId! })).rejects.toThrow("email");
  });

  it("rejects zero-total generation", async () => {
    const s = await setup(0);
    await expect(s.t.mutation(api.mutations.invoices.generateFromJobs, { ...s.ownerArgs, commercialAccountId: s.account, billingStartDate: "2030-01-01", billingEndDate: "2030-01-31" })).rejects.toThrow("greater than zero");
    expect((await s.t.run(async ctx => ctx.db.query("invoices").collect()))).toHaveLength(0);
    const oldDraft = await s.t.run(async ctx => ctx.db.insert("invoices", { companyId: s.company, clientRelationshipId: s.relationship, commercialAccountId: s.account, title: "Old zero draft", invoiceNumber: "INV-OLD", status: "draft", billingStartDate: "2030-01-01", billingEndDate: "2030-01-31", issueDate: "2030-01-31", dueDate: "2030-02-28", subtotalCents: 0, taxCents: 0, totalCents: 0, jobIds: [], createdAt: 1, updatedAt: 1 }));
    await expect(s.t.mutation(api.mutations.invoices.markIssued, { ...s.ownerArgs, invoiceId: oldDraft })).rejects.toThrow("greater than zero");
  });
});
