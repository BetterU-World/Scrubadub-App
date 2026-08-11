import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { readFileSync } from "node:fs";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "test-password-123";

describe("Manager Experience V2 financial, invoice, and analytics delegation", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "manager-v2-pr3-pepper";
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
  });

  it("keeps the three capabilities independent, tenant-scoped, and revocable", async () => {
    const t = convexTest(schema, modules);
    const passwordHash = await hashPassword(PASSWORD);
    const seeded = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "PR3 Co", timezone: "America/New_York" });
      const otherCompanyId = await ctx.db.insert("companies", { name: "Other Co", timezone: "America/New_York" });
      const makeUser = (email: string, role: "owner" | "manager" | "cleaner", fields = {}) => ctx.db.insert("users", { email, passwordHash, name: email, companyId, role, status: "active", ...fields });
      const owner = await makeUser("owner@pr3.test", "owner");
      const financial = await makeUser("financial@pr3.test", "manager", { canViewFinancials: true });
      const invoices = await makeUser("invoices@pr3.test", "manager", { canManageInvoices: true });
      const analytics = await makeUser("analytics@pr3.test", "manager", { canViewAnalytics: true });
      const none = await makeUser("none@pr3.test", "manager");
      const cleaner = await makeUser("cleaner@pr3.test", "cleaner");
      const account = await ctx.db.insert("commercialAccounts", { companyId, clientName: "Client", status: "active", createdAt: Date.now(), updatedAt: Date.now() });
      const invoice = await ctx.db.insert("invoices", { companyId, commercialAccountId: account, title: "Invoice", invoiceNumber: "INV-1", status: "draft", billingStartDate: "2026-01-01", billingEndDate: "2026-01-31", issueDate: "2026-02-01", dueDate: "2026-02-15", subtotalCents: 10000, taxCents: 0, totalCents: 10000, jobIds: [], createdAt: Date.now(), updatedAt: Date.now() });
      return { companyId, otherCompanyId, owner, financial, invoices, analytics, none, cleaner, invoice };
    });
    const signIn = (email: string) => t.action(api.authActions.signIn, { email, password: PASSWORD });
    const ownerAuth = await signIn("owner@pr3.test");
    const financialAuth = await signIn("financial@pr3.test");
    const invoicesAuth = await signIn("invoices@pr3.test");
    const analyticsAuth = await signIn("analytics@pr3.test");
    const noneAuth = await signIn("none@pr3.test");
    const cleanerAuth = await signIn("cleaner@pr3.test");
    const financialArgs = { companyId: seeded.companyId, userId: seeded.financial, sessionToken: financialAuth.sessionToken };
    await expect(t.query(api.queries.financials.getSummary, financialArgs)).resolves.toMatchObject({ invoicedCents: 10000 });
    await expect(t.query(api.queries.financials.getSummary, { companyId: seeded.companyId, userId: seeded.owner, sessionToken: ownerAuth.sessionToken })).resolves.toBeTruthy();
    await expect(t.query(api.queries.financials.getSummary, { ...financialArgs, companyId: seeded.otherCompanyId })).rejects.toThrow("Access denied");
    await expect(t.query(api.queries.financials.getSummary, { companyId: seeded.companyId, userId: seeded.none, sessionToken: noneAuth.sessionToken })).rejects.toThrow("canViewFinancials permission required");
    await expect(t.query(api.queries.financials.getSummary, { companyId: seeded.companyId, userId: seeded.cleaner, sessionToken: cleanerAuth.sessionToken })).rejects.toThrow("Owner or manager session required");
    await expect(t.query(api.queries.invoices.listByCompany, { userId: seeded.invoices, sessionToken: invoicesAuth.sessionToken })).resolves.toHaveLength(1);
    await expect(t.query(api.queries.invoices.listByCompany, { userId: seeded.financial, sessionToken: financialAuth.sessionToken })).resolves.toHaveLength(1);
    await expect(t.mutation(api.mutations.invoices.markIssued, { userId: seeded.financial, sessionToken: financialAuth.sessionToken, invoiceId: seeded.invoice })).rejects.toThrow("canManageInvoices permission required");
    await expect(t.mutation(api.mutations.invoices.markIssued, { userId: seeded.invoices, sessionToken: invoicesAuth.sessionToken, invoiceId: seeded.invoice })).resolves.toBeNull();
    await expect(t.query(api.queries.analytics.getOperationalSummary, { companyId: seeded.companyId, userId: seeded.analytics, sessionToken: analyticsAuth.sessionToken })).resolves.toMatchObject({ completed30: 0, flagsOpened30: 0 });
    await expect(t.query(api.queries.analytics.getOperationalSummary, { companyId: seeded.companyId, userId: seeded.financial, sessionToken: financialAuth.sessionToken })).rejects.toThrow("canViewAnalytics permission required");
    await expect(t.query(api.queries.analytics.getOperationalSummary, { companyId: seeded.otherCompanyId, userId: seeded.analytics, sessionToken: analyticsAuth.sessionToken })).rejects.toThrow("Access denied");
    await t.run((ctx) => ctx.db.patch(seeded.financial, { canViewFinancials: false }));
    await expect(t.query(api.queries.financials.getSummary, financialArgs)).rejects.toThrow("canViewFinancials permission required");
  });

  it("protects routes, read-only invoice UI, and capability-specific navigation", () => {
    const app = readFileSync("packages/frontend/src/App.tsx", "utf8");
    const detail = readFileSync("packages/frontend/src/pages/owner/CommercialInvoiceDetailPage.tsx", "utf8");
    const navigation = readFileSync("packages/frontend/src/components/layout/navigation.ts", "utf8");
    expect(app).toContain('user?.canViewAnalytics && <Route path="/analytics"');
    expect(app).toContain('user?.canViewFinancials && <Route path="/financials"');
    expect(app).toContain('"/analytics", "/financials"');
    expect(app).toContain('(user?.canManageInvoices || user?.canViewFinancials) && <Route path="/commercial-invoices"');
    expect(detail).toContain('const canManageInvoices = user.role === "owner" || user.canManageInvoices === true');
    expect(detail).toContain("{canManageInvoices && <section");
    expect(navigation).toContain('(canViewAnalytics || (item.href !== "/performance" && item.href !== "/analytics"))');
  });
});
