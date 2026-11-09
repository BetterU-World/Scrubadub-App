import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import type { Doc } from "../../_generated/dataModel";
import { hashToken } from "../tokens";
import { authorizeDispatch, finishEmail } from "../../invoiceDeliveryInternal";
import { INVOICE_EMAIL_CLAIM_MS } from "../invoiceEmailDelivery";
const provider = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({ Resend: class { emails = { send: provider }; } }));
const modules = import.meta.glob("../../**/*.ts");
const NOW = Date.parse("2030-01-01T12:00:00Z");
const accepted = { data: { id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" }, error: null };
beforeEach(() => {
  vi.useFakeTimers({ now: NOW }); provider.mockReset(); provider.mockResolvedValue(accepted);
  vi.stubEnv("APP_URL", "https://scrub.example.test"); vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("RESEND_FROM_EMAIL", "mail@example.test"); vi.stubEnv("SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS", "false");
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const companyId = await ctx.db.insert("companies", { name: "Invoice company", timezone: "UTC", contactEmail: "reply@company.test" });
    const foreignCompany = await ctx.db.insert("companies", { name: "Foreign", timezone: "UTC" });
    const user = async (name: string, role: Doc<"users">["role"], company = companyId, flags = {}) => {
      const id = await ctx.db.insert("users", { name, role, companyId: company, status: "active", email: `${name}@invoice.test`, passwordHash: "unused", ...flags });
      const sessionId = await ctx.db.insert("authSessions", { principalType: "staff", userId: id, tokenHash: hashToken(name), version: 1,
        createdAt: NOW, lastUsedAt: NOW, expiresAt: NOW + 7200000, idleExpiresAt: NOW + 7200000 });
      return { id, sessionId };
    };
    const owner = await user("owner", "owner"), manager = await user("manager", "manager", companyId, { canManageInvoices: true });
    const reader = await user("reader", "manager", companyId, { canViewFinancials: true });
    const foreignOwner = await user("foreignOwner", "owner", foreignCompany);
    const client = await ctx.db.insert("clientUsers", { displayName: "Client", email: "client@invoice.test", passwordHash: "unused", status: "active", createdAt: NOW, updatedAt: NOW });
    const relationship = await ctx.db.insert("clientRelationships", { companyId, clientUserId: client, email: "client@invoice.test", displayName: "Client", clientType: "commercial", status: "active", createdAt: NOW, updatedAt: NOW });
    const account = await ctx.db.insert("commercialAccounts", { companyId, clientRelationshipId: relationship, clientName: "Client", status: "active", createdAt: NOW, updatedAt: NOW });
    const invoice = await ctx.db.insert("invoices", { companyId, clientRelationshipId: relationship, commercialAccountId: account,
      title: "Existing invoice", invoiceNumber: "INV-100", status: "issued", billingStartDate: "2029-12-01", billingEndDate: "2029-12-31",
      issueDate: "2030-01-01", dueDate: "2030-01-31", subtotalCents: 10000, taxCents: 500, totalCents: 10500, jobIds: [], createdAt: NOW, updatedAt: NOW });
    return { companyId, foreignCompany, owner, manager, reader, foreignOwner, client, relationship, account, invoice };
  });
  const auth = (name: "owner" | "manager" | "reader" | "foreignOwner" = "owner") => ({ userId: ids[name].id, sessionToken: name });
  const args = { ...auth(), invoiceId: ids.invoice, requestKey: "initial-request-0001" };
  const send = (extra = {}) => t.action(api.invoiceActions.sendInvoice, { ...args, ...extra });
  const prepare = (extra = {}) => t.mutation(internal.invoiceDeliveryInternal.prepareEmail, { ...args, ...extra });
  const row = () => t.run(ctx => ctx.db.get(ids.invoice));
  const attempts = () => t.run(ctx => ctx.db.query("transactionalDocumentDeliveryAttempts").collect());
  return { t, ...ids, auth, args, send, prepare, row, attempts };
}

describe("invoice email delivery safety", () => {
  it("concurrent/double-click requests converge on one send, with positive evidence and reply routing", async () => {
    const s = await setup();
    const results = await Promise.all([s.send(), s.send(), s.send({ requestKey: "different-request-0002" })]);
    expect(new Set(results.map(result => result.attemptId)).size).toBe(1); expect(provider).toHaveBeenCalledTimes(1);
    expect((await s.attempts())[0]).toMatchObject({ documentKind: "invoice", result: "provider_accepted", providerMessageId: accepted.data.id });
    expect((await s.attempts())[0].recipientEmail).toBeUndefined();
    expect(provider.mock.calls[0][0]).toMatchObject({ to: "client@invoice.test", replyTo: "reply@company.test" });
    expect(await s.row()).toMatchObject({ status: "issued", subtotalCents: 10000, taxCents: 500, totalCents: 10500, sentAt: NOW });
    await s.send(); expect(provider).toHaveBeenCalledTimes(1);
  });

  it("blocks a second action while the first provider call is in flight", async () => {
    const s = await setup(); let release!: (value: typeof accepted) => void; let started!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    provider.mockImplementationOnce(() => { started(); return new Promise(resolve => { release = resolve; }); });
    const first = s.send(); await entered;
    const second = await s.send({ requestKey: "another-request-0002" });
    expect(second.status).toBe("pending"); expect(provider).toHaveBeenCalledTimes(1);
    release(accepted); expect((await first).status).toBe("provider_accepted");
  });

  it("uses an active same-company owner reply-to fallback without selecting managers", async () => {
    const s = await setup(); await s.t.run(ctx => ctx.db.patch(s.companyId, { contactEmail: undefined }));
    await s.send(); expect(provider.mock.calls[0][0].replyTo).toBe("owner@invoice.test");
  });

  it("explicit resend requires the current predecessor and deduplicates repeated requests", async () => {
    const s = await setup(); const first = await s.send();
    const resend = { resend: true, previousAttemptId: first.attemptId, requestKey: "resend-request-0002" };
    const results = await Promise.all([s.send(resend), s.send(resend)]);
    expect(new Set(results.map(r => r.attemptId)).size).toBe(1); expect(provider).toHaveBeenCalledTimes(2);
    await s.send(resend); expect(provider).toHaveBeenCalledTimes(2);
    await expect(s.send({ ...resend, requestKey: "resend-request-0003" })).rejects.toThrow("state changed");
    expect(await s.t.run(ctx => ctx.db.query("invoices").collect())).toHaveLength(1);
    expect(await s.t.run(ctx => ctx.db.query("invoicePaymentAttempts").collect())).toHaveLength(0);
  });

  it("reads changed contact email at dispatch rather than from a prepare snapshot", async () => {
    const s = await setup(); const prepared = await s.prepare();
    await s.t.run(ctx => ctx.db.patch(s.relationship, { email: "changed@invoice.test" }));
    const payload = await s.t.mutation(internal.invoiceDeliveryInternal.authorizeDispatch, { ...s.auth(), attemptId: prepared.response.attemptId });
    expect(payload?.recipientEmail).toBe("changed@invoice.test");
    expect(await s.t.mutation(internal.invoiceDeliveryInternal.authorizeDispatch, { ...s.auth(), attemptId: prepared.response.attemptId })).toBeNull();
  });

  it.each(["client-inactive", "relationship-inactive", "client-removed", "relationship-removed", "client-relinked", "foreign-relationship", "actor-revoked", "actor-company", "invoice-company", "manager-permission", "void", "paid", "deleted"] as const)("rechecks %s before the external send", async change => {
    const s = await setup();
    const target = authorizeDispatch as unknown as { _handler: (ctx: any, args: any) => Promise<unknown> };
    const original = target._handler;
    vi.spyOn(target, "_handler").mockImplementationOnce(async (ctx, args) => {
      if (change === "client-inactive") await ctx.db.patch(s.client, { status: "disabled" });
      if (change === "relationship-inactive") await ctx.db.patch(s.relationship, { status: "inactive" });
      if (change === "client-removed") await ctx.db.delete(s.client);
      if (change === "relationship-removed") await ctx.db.delete(s.relationship);
      if (change === "client-relinked") {
        const other = await ctx.db.insert("clientUsers", { displayName: "Other", email: "other@invoice.test", status: "active", createdAt: NOW, updatedAt: NOW });
        await ctx.db.patch(s.relationship, { clientUserId: other });
      }
      if (change === "foreign-relationship") await ctx.db.patch(s.relationship, { companyId: s.foreignCompany });
      if (change === "actor-revoked") await ctx.db.patch(s.owner.sessionId, { revokedAt: NOW });
      if (change === "actor-company") await ctx.db.patch(s.owner.id, { companyId: s.foreignCompany });
      if (change === "invoice-company") await ctx.db.patch(s.invoice, { companyId: s.foreignCompany });
      if (change === "manager-permission") await ctx.db.patch(s.manager.id, { canManageInvoices: false });
      if (change === "void" || change === "paid") await ctx.db.patch(s.invoice, { status: change });
      if (change === "deleted") await ctx.db.delete(s.invoice);
      return original(ctx, args);
    });
    expect((await s.send(change === "manager-permission" ? s.auth("manager") : {})).status).toBe("skipped");
    expect(provider).not.toHaveBeenCalled(); expect((await s.attempts())[0].result).toBe("skipped");
  });

  it("authorizes invoice managers and denies readers/foreign owners, including diagnostic access boundaries", async () => {
    const s = await setup();
    for (const name of ["reader", "foreignOwner"] as const) await expect(s.send(s.auth(name))).rejects.toThrow();
    expect((await s.send(s.auth("manager"))).status).toBe("provider_accepted");
    const query = (name: "owner" | "reader" | "foreignOwner") => s.t.query(api.queries.invoices.getById, { ...s.auth(name), invoiceId: s.invoice });
    expect((await query("reader"))?.emailDelivery).toMatchObject({ status: "provider_accepted" });
    await expect(query("foreignOwner")).rejects.toThrow("Access denied");
    expect(JSON.stringify((await query("owner"))?.emailDelivery)).not.toContain("@invoice.test");
  });

  it.each([
    { data: null, error: null }, { data: {}, error: null },
    { data: null, error: { name: "application_error", statusCode: null } },
    { data: null, error: { name: "application_error", statusCode: 500 } },
  ])("unknown provider outcomes block retries and preserve all financial state: %j", async response => {
    const s = await setup(); const before = await s.row(); provider.mockResolvedValue(response);
    const result = await s.send(); expect(result.status).toBe("unknown");
    expect((await s.send({ resend: true, previousAttemptId: result.attemptId, requestKey: "retry-request-0002" })).status).toBe("unknown");
    const after = await s.row(); expect(after).toEqual({ ...before, latestEmailAttemptId: result.attemptId });
    expect(provider).toHaveBeenCalledTimes(1); expect(await s.attempts()).toHaveLength(1);
  });

  it.each(["validation_error", "rate_limit_exceeded"] as const)("records definite %s without automatic retry and permits a deliberate retry", async name => {
    const s = await setup(); provider.mockResolvedValueOnce({ data: null, error: { name, statusCode: name === "rate_limit_exceeded" ? 429 : 422 } });
    const result = await s.send(); expect(result.status).toBe("failed"); expect((await s.row())?.sentAt).toBeUndefined();
    await s.t.finishAllScheduledFunctions(() => { vi.runAllTimers(); }); expect(provider).toHaveBeenCalledTimes(1);
    expect((await s.send({ resend: true, previousAttemptId: result.attemptId, requestKey: "retry-request-0002" })).status).toBe("provider_accepted");
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it("treats thrown network failure as unknown without sensitive logs", async () => {
    const s = await setup(); provider.mockRejectedValue(new Error("timeout client@invoice.test private body"));
    const error = vi.spyOn(console, "error"); expect((await s.send()).status).toBe("unknown");
    expect(error).not.toHaveBeenCalled(); expect(JSON.stringify(await s.attempts())).not.toMatch(/client@|private body/);
  });

  it("records definite URL preflight failure without contacting the provider", async () => {
    const s = await setup(); vi.stubEnv("APP_URL", "");
    expect((await s.send()).status).toBe("failed");
    expect(provider).not.toHaveBeenCalled(); expect((await s.row())?.sentAt).toBeUndefined();
  });

  it("handles acceptance followed by failed persistence without inviting a resend", async () => {
    const s = await setup();
    const finish = vi.spyOn(finishEmail as unknown as { _handler: (...args: unknown[]) => Promise<unknown> }, "_handler").mockRejectedValueOnce(new Error("write failed"));
    const result = await s.send(); finish.mockRestore(); expect(result.status).toBe("unknown");
    expect((await s.attempts())[0].result).toBe("pending");
    vi.setSystemTime(NOW + INVOICE_EMAIL_CLAIM_MS);
    expect((await s.send()).status).toBe("unknown");
    await s.t.mutation(internal.invoiceDeliveryInternal.expireEmail, { attemptId: result.attemptId });
    expect(provider).toHaveBeenCalledTimes(1); expect((await s.row())?.sentAt).toBeUndefined();
  });

  it.each(["paid", "void", "deleted"] as const)("records positive evidence if invoice becomes %s after the provider call", async status => {
    const s = await setup(); provider.mockImplementationOnce(async () => {
      await s.t.run(ctx => status === "deleted" ? ctx.db.delete(s.invoice) : ctx.db.patch(s.invoice, { status })); return accepted;
    });
    expect((await s.send()).status).toBe("provider_accepted");
    if (status !== "deleted") expect(await s.row()).toMatchObject({ status, sentAt: NOW, totalCents: 10500 });
    expect((await s.attempts())[0].providerMessageId).toBe(accepted.data.id);
  });

  it("legacy calls are idempotent; historical sentAt remains unverified and requires confirmation", async () => {
    const s = await setup(); await s.t.run(ctx => ctx.db.patch(s.invoice, { sentAt: NOW - 100 }));
    const query = () => s.t.query(api.queries.invoices.getById, { ...s.auth(), invoiceId: s.invoice });
    expect((await query())?.emailDelivery.status).toBe("unverified");
    await expect(s.send()).rejects.toThrow("Confirm a deliberate resend");
    expect(await s.t.mutation(internal.invoiceDeliveryInternal.markSent, { companyId: s.companyId, invoiceId: s.invoice })).toEqual({ sentAt: NOW - 100 });
    const legacy = { userId: s.owner.id, sessionToken: "owner", invoiceId: s.invoice, resend: true };
    await s.t.action(api.invoiceActions.sendInvoice, legacy); await s.t.action(api.invoiceActions.sendInvoice, legacy);
    expect(provider).toHaveBeenCalledTimes(1);
  });
});
