import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { internal } from "../../_generated/api";
import { invoiceCheckoutParameters } from "../invoiceCheckoutConfig";

const modules = import.meta.glob("../../**/*.ts");

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const company = await ctx.db.insert("companies", { name: "Payee", timezone: "America/New_York", stripeConnectAccountId: "acct_payee" });
    const client = await ctx.db.insert("clientUsers", { email: "pay@test.dev", displayName: "Payer", status: "active", createdAt: 1, updatedAt: 1 });
    const other = await ctx.db.insert("clientUsers", { email: "other@test.dev", displayName: "Other", status: "active", createdAt: 1, updatedAt: 1 });
    const relationship = await ctx.db.insert("clientRelationships", { companyId: company, clientUserId: client, displayName: "Payer", clientType: "commercial", status: "active", createdAt: 1, updatedAt: 1 });
    const account = await ctx.db.insert("commercialAccounts", { companyId: company, clientRelationshipId: relationship, clientName: "Payer", contractAmountCents: 50000, status: "active", createdAt: 1, updatedAt: 1 });
    const invoice = await ctx.db.insert("invoices", { companyId: company, clientRelationshipId: relationship, commercialAccountId: account, invoiceType: "commercial", title: "Service", invoiceNumber: "INV-00001", status: "issued", billingStartDate: "2030-01-01", billingEndDate: "2030-01-31", issueDate: "2030-02-01", dueDate: "2030-03-01", subtotalCents: 50000, taxCents: 0, totalCents: 50000, jobIds: [], createdAt: 1, updatedAt: 1 });
    return { company, client, other, relationship, invoice };
  });
  return { t, ...ids };
}

describe("invoice payment attempts", () => {
  it("configures exact destination charge, $2 company-paid fee, and unique idempotency", () => {
    const attempt = { _id: "attempt_one", invoiceId: "invoice_one", companyId: "company_one", amountCents: 50000, destinationStripeAccountId: "acct_payee" };
    const { parameters, options } = invoiceCheckoutParameters(attempt, "INV-00001", "https://app.test");
    expect(parameters).toMatchObject({ mode: "payment", payment_method_types: ["card"], line_items: [{ price_data: { unit_amount: 50000, currency: "usd" } }], payment_intent_data: { transfer_data: { destination: "acct_payee" }, application_fee_amount: 200, metadata: { invoicePaymentAttemptId: "attempt_one", invoiceId: "invoice_one", companyId: "company_one" } }, metadata: { invoicePaymentAttemptId: "attempt_one" }, success_url: "https://app.test/client/billing?invoice_payment=processing", cancel_url: "https://app.test/client/billing?invoice_payment=cancel" });
    expect(options.idempotencyKey).toBe("invoice-payment-attempt:attempt_one");
    expect(invoiceCheckoutParameters({ ...attempt, _id: "attempt_two" }, "INV-00001", "https://app.test").options.idempotencyKey).not.toBe(options.idempotencyKey);
  });
  it("binds an issued invoice to one active attempt and exact $2 fee", async () => {
    const s = await setup();
    await expect(s.t.query(internal.invoicePaymentInternal.inspect, { invoiceId: s.invoice, clientUserId: s.other })).rejects.toThrow("Access denied");
    const attemptId = await s.t.mutation(internal.invoicePaymentInternal.reserve, { invoiceId: s.invoice, clientUserId: s.client, destinationStripeAccountId: "acct_payee" });
    expect(await s.t.mutation(internal.invoicePaymentInternal.reserve, { invoiceId: s.invoice, clientUserId: s.client, destinationStripeAccountId: "acct_payee" })).toBe(attemptId);
    const attempt = await s.t.run(ctx => ctx.db.get(attemptId));
    expect(attempt).toMatchObject({ amountCents: 50000, currency: "usd", platformFeeCents: 200, destinationStripeAccountId: "acct_payee", status: "creating" });
    expect((await s.t.run(ctx => ctx.db.get(s.invoice)))?.totalCents).toBe(50000);
    await expect(s.t.mutation(internal.invoicePaymentInternal.reserve, { invoiceId: s.invoice, clientUserId: s.client, destinationStripeAccountId: "acct_other" })).rejects.toThrow("account changed");
  });

  it("atomically applies an exact successful payment and treats retries as idempotent", async () => {
    const s = await setup();
    const attemptId = await s.t.mutation(internal.invoicePaymentInternal.reserve, { invoiceId: s.invoice, clientUserId: s.client, destinationStripeAccountId: "acct_payee" });
    await s.t.mutation(internal.invoicePaymentInternal.opened, { attemptId, sessionId: "cs_exact", url: "https://checkout.stripe.test/session" });
    const facts = { attemptId, sessionId: "cs_exact", paymentIntentId: "pi_exact", amountCents: 50000, currency: "usd", destination: "acct_payee", feeCents: 200, invoiceIdMetadata: String(s.invoice), companyIdMetadata: String(s.company) };
    expect(await s.t.mutation(internal.invoicePaymentInternal.applySuccess, facts)).toBe("paid");
    expect(await s.t.mutation(internal.invoicePaymentInternal.applySuccess, facts)).toBe("already_paid");
    expect(await s.t.run(ctx => ctx.db.get(s.invoice))).toMatchObject({ status: "paid", paymentSource: "online", canonicalPaymentAttemptId: attemptId, stripePaymentIntentId: "pi_exact" });
  });

  it("keeps reconciliation terminal even when a later call supplies matching facts", async () => {
    const s = await setup();
    const attemptId = await s.t.mutation(internal.invoicePaymentInternal.reserve, { invoiceId: s.invoice, clientUserId: s.client, destinationStripeAccountId: "acct_payee" });
    await s.t.mutation(internal.invoicePaymentInternal.opened, { attemptId, sessionId: "cs_review", url: "https://checkout.stripe.test/review" });
    const facts = { attemptId, sessionId: "cs_review", paymentIntentId: "pi_review", amountCents: 50000, currency: "usd", destination: "acct_payee", feeCents: 200, invoiceIdMetadata: String(s.invoice), companyIdMetadata: String(s.company) };
    expect(await s.t.mutation(internal.invoicePaymentInternal.applySuccess, { ...facts, feeCents: 0 })).toBe("reconciliation_required");
    const original = await s.t.run(ctx => ctx.db.get(attemptId));
    expect(original).toMatchObject({ status: "reconciliation_required", exceptionReason: "payment_facts_mismatch", stripeCheckoutSessionId: "cs_review", stripePaymentIntentId: "pi_review" });
    expect((await s.t.run(ctx => ctx.db.get(s.invoice)))?.status).toBe("issued");
    expect(await s.t.mutation(internal.invoicePaymentInternal.applySuccess, facts)).toBe("reconciliation_required");
    expect(await s.t.mutation(internal.invoicePaymentInternal.applySuccess, { ...facts, paymentIntentId: "pi_later" })).toBe("reconciliation_required");
    expect(await s.t.run(ctx => ctx.db.get(attemptId))).toEqual(original);
    const invoice = await s.t.run(ctx => ctx.db.get(s.invoice));
    expect(invoice?.status).toBe("issued");
    expect(invoice?.canonicalPaymentAttemptId).toBeUndefined();
    expect(invoice?.paymentSource).toBeUndefined();
  });

  it("preserves a second real payment as reconciliation required", async () => {
    const s = await setup();
    const first = await s.t.mutation(internal.invoicePaymentInternal.reserve, { invoiceId: s.invoice, clientUserId: s.client, destinationStripeAccountId: "acct_payee" });
    await s.t.mutation(internal.invoicePaymentInternal.opened, { attemptId: first, sessionId: "cs_first", url: "https://checkout.stripe.test/first" });
    await s.t.mutation(internal.invoicePaymentInternal.markUnavailable, { attemptId: first, status: "expired" });
    const second = await s.t.mutation(internal.invoicePaymentInternal.reserve, { invoiceId: s.invoice, clientUserId: s.client, destinationStripeAccountId: "acct_payee" });
    await s.t.mutation(internal.invoicePaymentInternal.opened, { attemptId: second, sessionId: "cs_second", url: "https://checkout.stripe.test/second" });
    const facts = { amountCents: 50000, currency: "usd", destination: "acct_payee", feeCents: 200, invoiceIdMetadata: String(s.invoice), companyIdMetadata: String(s.company) };
    expect(await s.t.mutation(internal.invoicePaymentInternal.applySuccess, { ...facts, attemptId: first, sessionId: "cs_first", paymentIntentId: "pi_first" })).toBe("paid");
    expect(await s.t.mutation(internal.invoicePaymentInternal.applySuccess, { ...facts, attemptId: second, sessionId: "cs_second", paymentIntentId: "pi_second" })).toBe("reconciliation_required");
    expect((await s.t.run(ctx => ctx.db.get(second)))?.status).toBe("reconciliation_required");
    expect((await s.t.run(ctx => ctx.db.get(s.invoice)))?.canonicalPaymentAttemptId).toBe(first);
  });

  it.each([
    ["amount", { amountCents: 49999 }],
    ["currency", { currency: "eur" }],
    ["destination", { destination: "acct_other" }],
    ["invoice metadata", { invoiceIdMetadata: "different_invoice" }],
  ])("holds a successful payment for reconciliation when %s differs", async (_name, change) => {
    const s = await setup();
    const attemptId = await s.t.mutation(internal.invoicePaymentInternal.reserve, { invoiceId: s.invoice, clientUserId: s.client, destinationStripeAccountId: "acct_payee" });
    await s.t.mutation(internal.invoicePaymentInternal.opened, { attemptId, sessionId: "cs_mismatch", url: "https://checkout.stripe.test/mismatch" });
    const facts = { attemptId, sessionId: "cs_mismatch", paymentIntentId: "pi_mismatch", amountCents: 50000, currency: "usd", destination: "acct_payee", feeCents: 200, invoiceIdMetadata: String(s.invoice), companyIdMetadata: String(s.company), ...change };
    expect(await s.t.mutation(internal.invoicePaymentInternal.applySuccess, facts)).toBe("reconciliation_required");
    expect((await s.t.run(ctx => ctx.db.get(s.invoice)))?.status).toBe("issued");
    expect((await s.t.run(ctx => ctx.db.get(attemptId)))?.status).toBe("reconciliation_required");
  });

  it("rejects inactive relationships and unissued invoices before attempt reservation", async () => {
    const s = await setup();
    await s.t.run(ctx => ctx.db.patch(s.relationship, { status: "inactive" }));
    await expect(s.t.mutation(internal.invoicePaymentInternal.reserve, { invoiceId: s.invoice, clientUserId: s.client, destinationStripeAccountId: "acct_payee" })).rejects.toThrow("Access denied");
    await s.t.run(async ctx => { await ctx.db.patch(s.relationship, { status: "active" }); await ctx.db.patch(s.invoice, { status: "void" }); });
    await expect(s.t.mutation(internal.invoicePaymentInternal.reserve, { invoiceId: s.invoice, clientUserId: s.client, destinationStripeAccountId: "acct_payee" })).rejects.toThrow("not payable");
  });

  it.each(["outside", "void"])("retains a late successful charge after %s transition", async transition => {
    const s = await setup();
    const attemptId = await s.t.mutation(internal.invoicePaymentInternal.reserve, { invoiceId: s.invoice, clientUserId: s.client, destinationStripeAccountId: "acct_payee" });
    await s.t.mutation(internal.invoicePaymentInternal.opened, { attemptId, sessionId: "cs_late", url: "https://checkout.stripe.test/late" });
    await s.t.run(ctx => ctx.db.patch(s.invoice, transition === "outside" ? { status: "paid", paymentSource: "outside", paidAt: 5 } : { status: "void", voidedAt: 5 }));
    expect(await s.t.mutation(internal.invoicePaymentInternal.applySuccess, { attemptId, sessionId: "cs_late", paymentIntentId: "pi_late", amountCents: 50000, currency: "usd", destination: "acct_payee", feeCents: 200, invoiceIdMetadata: String(s.invoice), companyIdMetadata: String(s.company) })).toBe("reconciliation_required");
    expect((await s.t.run(ctx => ctx.db.get(attemptId)))?.stripePaymentIntentId).toBe("pi_late");
    expect((await s.t.run(ctx => ctx.db.get(s.invoice)))?.status).toBe(transition === "outside" ? "paid" : "void");
  });

  it("records a legacy signed Checkout event without minting a trusted attempt", async () => {
    const s = await setup();
    await s.t.mutation(internal.invoicePaymentInternal.recordException, { sessionId: "cs_legacy", paymentIntentId: "pi_legacy", invoiceIdCandidate: String(s.invoice), reason: "legacy_checkout_without_attempt", amountCents: 50000, currency: "usd" });
    await s.t.mutation(internal.invoicePaymentInternal.recordException, { sessionId: "cs_legacy", paymentIntentId: "pi_legacy", invoiceIdCandidate: String(s.invoice), reason: "legacy_checkout_without_attempt" });
    const exceptions = await s.t.run(ctx => ctx.db.query("invoicePaymentExceptions").collect());
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]).toMatchObject({ stripeCheckoutSessionId: "cs_legacy", stripePaymentIntentId: "pi_legacy", reason: "legacy_checkout_without_attempt" });
    expect((await s.t.run(ctx => ctx.db.get(s.invoice)))?.status).toBe("issued");
  });
});
