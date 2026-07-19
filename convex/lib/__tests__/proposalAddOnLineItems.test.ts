import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";
import {
  MAX_PROPOSAL_ADD_ON_LINES,
  calculateProposalTotals,
  normalizeProposalAddOnLine,
  validateProposalAddOnLines,
} from "../proposalAddOnLineItems";

const modules = import.meta.glob("../../**/*.ts");
const proposals = (api as any).mutations.proposals;
const PASSWORD = "test-password-123";

beforeEach(() => {
  process.env.TOKEN_PEPPER = "test-token-pepper";
  process.env.STRIPE_SECRET_KEY = "test-stripe-key";
  process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.RESEND_FROM_EMAIL = "test@example.com";
  process.env.APP_URL = "http://localhost:5173";
});

async function setup() {
  const t = convexTest(schema, modules);
  const passwordHash = await hashPassword(PASSWORD);
  const seeded = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Proposal Co", timezone: "America/New_York" });
    const foreignCompanyId = await ctx.db.insert("companies", { name: "Other Co", timezone: "America/New_York" });
    const ownerId = await ctx.db.insert("users", { email: "proposal-owner@example.com", passwordHash, name: "Owner", companyId, role: "owner", status: "active" });
    const flatId = await ctx.db.insert("companyAddOns", { companyId, name: "Catalog flat", pricingMethod: "flat", priceCents: 2500, isActive: true, isPublic: false, displayOrder: 0, createdByUserId: ownerId, createdAt: 1, updatedAt: 1 });
    const foreignId = await ctx.db.insert("companyAddOns", { companyId: foreignCompanyId, name: "Foreign", pricingMethod: "flat", priceCents: 1000, isActive: true, isPublic: true, displayOrder: 0, createdByUserId: ownerId, createdAt: 1, updatedAt: 1 });
    const requestId = await ctx.db.insert("clientRequests", {
      companyId, createdAt: 1, status: "new", requesterName: "Customer", requesterEmail: "customer@example.com",
      propertySnapshot: {}, source: "public_link", leadType: "residential", leadStage: "new", requestedService: "Core cleaning",
      requestedAddOnSnapshots: [{ sourceCompanyAddOnId: flatId, name: "Requested original", pricingMethod: "per_unit", priceCents: 800, unitLabel: "window", quantity: 3 }],
    });
    return { companyId, ownerId, flatId, foreignId, requestId };
  });
  const auth = await t.action(api.authActions.signIn, { email: "proposal-owner@example.com", password: PASSWORD });
  return { t, ...seeded, auth: { userId: seeded.ownerId, sessionToken: auth.sessionToken } };
}

function custom(overrides: Record<string, unknown> = {}) {
  return { lineItemId: "line-1", sourceType: "custom", name: "Custom", pricingMethod: "flat", unitPriceCents: 1000, billingCadence: "one_time", ...overrides } as any;
}

describe("proposal add-on line items", () => {
  it("calculates cadence totals and requires safe starting-at finalization", () => {
    const totals = calculateProposalTotals({ monthlyPriceCents: 10_000, oneTimePriceCents: 5_000, addOnLineItems: [
      custom({ lineItemId: "flat", billingCadence: "monthly", unitPriceCents: 2_500 }),
      custom({ lineItemId: "units", pricingMethod: "per_unit", unitPriceCents: 800, unitLabel: "window", quantity: 3 }),
      custom({ lineItemId: "start", pricingMethod: "starting_at", unitPriceCents: 4_000, finalizedPriceCents: 5_500 }),
    ] });
    expect(totals).toMatchObject({ monthlyTotalCents: 12_500, oneTimeTotalCents: 12_900, hasMonthlyPricing: true, hasOneTimePricing: true, hasUnfinalizedStartingAt: false });
    expect(calculateProposalTotals({ addOnLineItems: [custom({ pricingMethod: "starting_at" })] }).hasUnfinalizedStartingAt).toBe(true);
    expect(() => normalizeProposalAddOnLine(custom({ pricingMethod: "starting_at", finalizedPriceCents: 999 }))).toThrow("below");
  });

  it("enforces quantities, traceability, uniqueness, limits, and overflow bounds", () => {
    expect(() => normalizeProposalAddOnLine(custom({ pricingMethod: "per_unit", unitLabel: "window", quantity: undefined }))).toThrow("quantity");
    expect(() => normalizeProposalAddOnLine(custom({ pricingMethod: "per_unit", quantity: 1 }))).toThrow("unit label");
    expect(() => normalizeProposalAddOnLine(custom({ pricingMethod: "flat", quantity: 2 }))).toThrow("only allowed");
    expect(() => normalizeProposalAddOnLine(custom({ sourceType: "request_snapshot" }))).toThrow("traceability");
    expect(() => normalizeProposalAddOnLine(custom({ sourceType: "catalog" }))).toThrow("catalog-only");
    expect(() => validateProposalAddOnLines([custom(), custom()])).toThrow("unique");
    expect(() => validateProposalAddOnLines(Array.from({ length: MAX_PROPOSAL_ADD_ON_LINES + 1 }, (_, i) => custom({ lineItemId: `line-${i}` })))).toThrow("at most");
    expect(() => calculateProposalTotals({ monthlyPriceCents: 1_000_000_000, addOnLineItems: [custom({ billingCadence: "monthly" })] })).toThrow("too large");
  });

  it("copies immutable request snapshots and supports independent catalog/custom edits", async () => {
    const { t, auth, requestId, flatId } = await setup();
    const proposalId = await t.mutation(proposals.createProposalFromLead, { ...auth, clientRequestId: requestId });
    let proposal: any = await t.run((ctx) => ctx.db.get(proposalId));
    expect(proposal.scopeOfWork).toBe("Core cleaning");
    expect(proposal.addOnLineItems[0]).toMatchObject({ sourceType: "request_snapshot", sourceClientRequestId: requestId, sourceCompanyAddOnId: flatId, name: "Requested original", unitPriceCents: 800, unitLabel: "window", quantity: 3 });

    await t.run(async (ctx) => { await ctx.db.patch(requestId, { requestedAddOnSnapshots: [] }); await ctx.db.patch(flatId, { name: "Changed later", priceCents: 9999 }); });
    proposal = await t.run((ctx) => ctx.db.get(proposalId));
    expect(proposal.addOnLineItems[0]).toMatchObject({ name: "Requested original", unitPriceCents: 800 });

    await t.mutation(proposals.addCatalogAddOnLine, { ...auth, proposalId, companyAddOnId: flatId, billingCadence: "monthly" });
    const customId = await t.mutation(proposals.addCustomAddOnLine, { ...auth, proposalId, name: "Custom line", pricingMethod: "starting_at", unitPriceCents: 3000, finalizedPriceCents: 4500, billingCadence: "one_time" });
    await t.mutation(proposals.updateAddOnLine, { ...auth, proposalId, lineItemId: customId, name: "Edited custom", pricingMethod: "flat", unitPriceCents: 5000, billingCadence: "monthly" });
    proposal = await t.run((ctx) => ctx.db.get(proposalId));
    expect(proposal.addOnLineItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceType: "catalog", sourceCompanyAddOnId: flatId, name: "Changed later", unitPriceCents: 9999 }),
      expect.objectContaining({ lineItemId: customId, sourceType: "custom", name: "Edited custom", unitPriceCents: 5000 }),
    ]));
    await t.mutation(proposals.removeAddOnLine, { ...auth, proposalId, lineItemId: customId });
    expect((await t.run((ctx) => ctx.db.get(proposalId)))!.addOnLineItems!.some((line: any) => line.lineItemId === customId)).toBe(false);
  });

  it("rejects foreign catalog lines and makes sent proposals editable only after token-invalidating return to draft", async () => {
    const { t, auth, requestId, foreignId } = await setup();
    const proposalId = await t.mutation(proposals.createProposalFromLead, { ...auth, clientRequestId: requestId });
    await expect(t.mutation(proposals.addCatalogAddOnLine, { ...auth, proposalId, companyAddOnId: foreignId, billingCadence: "one_time" })).rejects.toThrow("unavailable");
    await t.mutation(proposals.markProposalSent, { ...auth, proposalId });
    await t.run((ctx) => ctx.db.patch(proposalId, { proposalTokenHash: "old-token", proposalTokenCreatedAt: 123 }));
    await expect(t.mutation(proposals.updateProposal, { ...auth, proposalId, title: "Blocked", clientName: "Customer" })).rejects.toThrow("Return");
    await t.mutation(proposals.returnProposalToDraft, { ...auth, proposalId });
    const draft: any = await t.run((ctx) => ctx.db.get(proposalId));
    expect(draft).toMatchObject({ status: "draft" });
    expect(draft.proposalTokenHash).toBeUndefined();
    await expect(t.mutation(proposals.updateProposal, { ...auth, proposalId, title: "Editable again", clientName: "Customer" })).resolves.toBeNull();
  });

  it("blocks unresolved starting-at delivery and keeps accepted/declined proposals immutable", async () => {
    const { t, auth, requestId } = await setup();
    const proposalId = await t.mutation(proposals.createProposalFromLead, { ...auth, clientRequestId: requestId });
    await t.mutation(proposals.addCustomAddOnLine, { ...auth, proposalId, name: "Needs quote", pricingMethod: "starting_at", unitPriceCents: 3000, billingCadence: "one_time" });
    await expect(t.mutation(proposals.markProposalSent, { ...auth, proposalId })).rejects.toThrow("Finalize");
    const line: any = (await t.run((ctx) => ctx.db.get(proposalId)))!.addOnLineItems!.at(-1);
    await t.mutation(proposals.updateAddOnLine, { ...auth, proposalId, lineItemId: line.lineItemId, name: line.name, pricingMethod: line.pricingMethod, unitPriceCents: line.unitPriceCents, finalizedPriceCents: 4000, billingCadence: line.billingCadence });
    await t.mutation(proposals.markProposalSent, { ...auth, proposalId });
    await t.mutation(proposals.markProposalAccepted, { ...auth, proposalId });
    await expect(t.mutation(proposals.returnProposalToDraft, { ...auth, proposalId })).rejects.toThrow("Only sent");
    await expect(t.mutation(proposals.markProposalDeclined, { ...auth, proposalId })).rejects.toThrow("immutable");
    await expect(t.mutation(proposals.updateAddOnLine, { ...auth, proposalId, lineItemId: line.lineItemId, name: "No", pricingMethod: "flat", unitPriceCents: 1, billingCadence: "one_time" })).rejects.toThrow("Return");
  });

  it("keeps owner/public/email UI localized, responsive, and public payloads free of trace IDs", () => {
    const owner = readFileSync(fileURLToPath(new URL("../../../packages/frontend/src/pages/owner/RequestDetailPage.tsx", import.meta.url)), "utf8");
    const publicView = readFileSync(fileURLToPath(new URL("../../../packages/frontend/src/pages/public/ProposalViewPage.tsx", import.meta.url)), "utf8");
    const delivery = readFileSync(fileURLToPath(new URL("../../proposalDeliveryInternal.ts", import.meta.url)), "utf8");
    const email = readFileSync(fileURLToPath(new URL("../email.ts", import.meta.url)), "utf8");
    const en = JSON.parse(readFileSync(fileURLToPath(new URL("../../../packages/frontend/src/i18n/en/common.json", import.meta.url)), "utf8"));
    const es = JSON.parse(readFileSync(fileURLToPath(new URL("../../../packages/frontend/src/i18n/es/common.json", import.meta.url)), "utf8"));
    expect(owner).toContain("returnProposalToDraft");
    expect(owner).toContain('proposal.status === "draft" &&');
    expect(owner).toContain('aria-label={t("proposals.addOns.remove",');
    expect(publicView).toContain("sm:flex-row");
    expect(email).toContain("proposal.addOnLineItems.map");
    const publicMapping = delivery.slice(delivery.indexOf("const addOnLineItems"), delivery.indexOf("return {", delivery.indexOf("const addOnLineItems")));
    expect(publicMapping).not.toContain("sourceCompanyAddOnId");
    expect(publicMapping).not.toContain("sourceClientRequestId");
    expect(en.proposals.addOns.returnToDraft).toBeTruthy();
    expect(es.proposals.addOns.returnToDraft).toBeTruthy();
  });
});
