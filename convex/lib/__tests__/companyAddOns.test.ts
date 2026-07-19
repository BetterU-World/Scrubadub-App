import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";
import { COMPANY_ADD_ON_PRESETS } from "../companyAddOnPresets";
import { MAX_ADD_ON_PRICE_CENTS, validateCompanyAddOnInput } from "../companyAddOnValidation";
import { hashToken } from "../tokens";
import { formatPublicAddOnPrice } from "../../../packages/frontend/src/lib/publicAddOnPresentation";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "test-password-123";
const backend = () => convexTest(schema, modules);
const catalogApi = api as any;

async function seed(t: ReturnType<typeof backend>) {
  const passwordHash = await hashPassword(PASSWORD);
  return await t.run(async (ctx) => {
    const companyA = await ctx.db.insert("companies", { name: "Catalog A", timezone: "America/New_York", publicRequestToken: "catalog-a-token" });
    const companyB = await ctx.db.insert("companies", { name: "Catalog B", timezone: "America/New_York", publicRequestToken: "catalog-b-token" });
    await ctx.db.insert("companySites", { companyId: companyA, slug: "catalog-a", templateId: "A", brandName: "A", bio: "Bio", serviceArea: "Area", services: ["Legacy service"] });
    const users: Record<string, any> = {};
    for (const [key, email, companyId, role, permitted] of [
      ["ownerA", "owner-a@catalog.test", companyA, "owner", false], ["ownerB", "owner-b@catalog.test", companyB, "owner", false],
      ["manager", "manager@catalog.test", companyA, "manager", true], ["managerNo", "manager-no@catalog.test", companyA, "manager", false],
      ["cleaner", "cleaner@catalog.test", companyA, "cleaner", false], ["maintenance", "maintenance@catalog.test", companyA, "maintenance", false],
      ["affiliate", "affiliate@catalog.test", undefined, "affiliate", false],
    ] as const) users[key] = await ctx.db.insert("users", { email, passwordHash, name: key, companyId, role, status: "active", canManageBusinessConfiguration: permitted || undefined });
    return { companyA, companyB, ...users };
  });
}

async function login(t: ReturnType<typeof backend>, email: string) { return await t.action(api.authActions.signIn, { email, password: PASSWORD }); }
function custom(auth: any, overrides: Record<string, unknown> = {}) { return { ...auth, name: "Custom add-on", description: "Description", pricingMethod: "flat", priceCents: 2500, isActive: true, isPublic: false, ...overrides }; }
function preset(auth: any, presetKey: string, locale: "en" | "es", overrides: Record<string, unknown> = {}) { return { ...auth, presetKey, locale, pricingMethod: "flat", priceCents: 7300, ...overrides }; }

describe("company add-on catalog", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "test-token-pepper";
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
  });

  it("keeps the preset browser viewport-contained with only the card body scrollable", () => {
    const source = readFileSync(fileURLToPath(new URL("../../../packages/frontend/src/pages/owner/CompanyAddOnsPage.tsx", import.meta.url)), "utf8");
    expect(source).toContain('<Dialog.Root open={presetOpen} onOpenChange={setPresetOpen}>');
    expect(source).toContain('className="fixed inset-x-4 bottom-4 top-4 z-50 mx-auto flex max-h-[calc(100dvh-2rem)] w-auto max-w-2xl flex-col overflow-hidden');
    expect(source).toContain('ref={presetScrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5"');
    expect(source).toContain("<Dialog.Close asChild>");
  });

  it("keeps public add-ons informational and separate from linked core services", () => {
    const source = readFileSync(fileURLToPath(new URL("../../../packages/frontend/src/pages/public/PublicSitePage.tsx", import.meta.url)), "utf8");
    const addOnSection = source.slice(source.indexOf("function AddOnsSection"), source.indexOf("function HowItWorksSection"));
    expect(source).toContain("(api as any).queries.companyAddOns.listPublic");
    expect(source.indexOf("<AddOnsSection")).toBeGreaterThan(source.indexOf("<ServicesSection"));
    expect(source).toContain("?service=${encodeURIComponent(card.name)}");
    expect(addOnSection).toContain("grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3");
    expect(addOnSection).not.toMatch(/<a(?:\s|>)/);
    expect(addOnSection).not.toContain("<button");
    expect(addOnSection).not.toContain("<input");
  });

  it("formats flat, starting-at, and per-unit public prices", () => {
    const labels = {
      startingAt: (price: string) => `Starting at ${price}`,
      perUnit: (price: string, unit: string) => `${price} per ${unit}`,
    };
    expect(formatPublicAddOnPrice({ pricingMethod: "flat", priceCents: 5000, unitLabel: null }, "en-US", labels)).toBe("$50.00");
    expect(formatPublicAddOnPrice({ pricingMethod: "starting_at", priceCents: 5000, unitLabel: null }, "en-US", labels)).toBe("Starting at $50.00");
    expect(formatPublicAddOnPrice({ pricingMethod: "per_unit", priceCents: 800, unitLabel: "window" }, "en-US", labels)).toBe("$8.00 per window");
  });

  it("enforces owner and explicitly permitted manager authorization", async () => {
    const t = backend(); const s = await seed(t);
    const owner = await login(t, "owner-a@catalog.test");
    const manager = await login(t, "manager@catalog.test");
    const ownerAuth = { userId: s.ownerA, sessionToken: owner.sessionToken };
    await expect(t.mutation(catalogApi.mutations.companyAddOns.create, custom(ownerAuth))).resolves.toBeTruthy();
    await expect(t.mutation(catalogApi.mutations.companyAddOns.create, custom({ userId: s.manager, sessionToken: manager.sessionToken }, { name: "Manager item" }))).resolves.toBeTruthy();
    for (const [key, email, error] of [["managerNo", "manager-no@catalog.test", "permission"], ["cleaner", "cleaner@catalog.test", "Owner or manager"], ["maintenance", "maintenance@catalog.test", "Owner or manager"], ["affiliate", "affiliate@catalog.test", "Owner or manager"]] as const) {
      const auth = await login(t, email);
      await expect(t.mutation(catalogApi.mutations.companyAddOns.create, custom({ userId: (s as any)[key], sessionToken: auth.sessionToken }))).rejects.toThrow(error);
    }
    await expect(t.query(catalogApi.queries.companyAddOns.list, { ...ownerAuth, userId: s.ownerB })).rejects.toThrow("does not match");
    const clientToken = "client-session-token";
    await t.run(async (ctx) => {
      const clientUserId = await ctx.db.insert("clientUsers", { email: "client@catalog.test", passwordHash: "unused", displayName: "Client", status: "active", createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("authSessions", { principalType: "client", clientUserId, tokenHash: hashToken(clientToken), version: 1, createdAt: Date.now(), lastUsedAt: Date.now(), expiresAt: Date.now() + 60_000, idleExpiresAt: Date.now() + 60_000 });
    });
    await expect(t.query(catalogApi.queries.companyAddOns.list, { sessionToken: clientToken })).rejects.toThrow("verified session");
  });

  it("validates every pricing method and bounded fields", () => {
    const base = { name: "Valid", pricingMethod: "flat" as const, priceCents: 1, isActive: true, isPublic: false };
    expect(validateCompanyAddOnInput(base)).toMatchObject({ priceCents: 1 });
    expect(validateCompanyAddOnInput({ ...base, pricingMethod: "starting_at" })).toMatchObject({ pricingMethod: "starting_at" });
    expect(validateCompanyAddOnInput({ ...base, pricingMethod: "per_unit", unitLabel: "window" })).toMatchObject({ unitLabel: "window" });
    for (const input of [
      { ...base, priceCents: 0 }, { ...base, priceCents: -1 }, { ...base, priceCents: 1.5 }, { ...base, priceCents: Number.MAX_SAFE_INTEGER + 1 }, { ...base, priceCents: MAX_ADD_ON_PRICE_CENTS + 1 },
      { ...base, pricingMethod: "per_unit" as const }, { ...base, unitLabel: "not allowed" }, { ...base, estimatedDurationMinutes: 0 }, { ...base, estimatedDurationMinutes: 1441 },
      { ...base, name: "x".repeat(81) }, { ...base, description: "x".repeat(501) }, { ...base, internalNotes: "x".repeat(2001) }, { ...base, isActive: false, isPublic: true },
    ]) expect(() => validateCompanyAddOnInput(input as any)).toThrow();
  });

  it("copies bilingual presets independently and restores archived copies without overwriting edits", async () => {
    const t = backend(); const s = await seed(t);
    const a = await login(t, "owner-a@catalog.test"); const b = await login(t, "owner-b@catalog.test");
    const authA = { userId: s.ownerA, sessionToken: a.sessionToken }; const authB = { userId: s.ownerB, sessionToken: b.sessionToken };
    const created = await t.mutation(catalogApi.mutations.companyAddOns.enablePreset, preset(authA, "interior_oven", "en", { pricingMethod: "starting_at", priceCents: 7300 }));
    const other = await t.mutation(catalogApi.mutations.companyAddOns.enablePreset, preset(authB, "interior_oven", "es", { priceCents: 9100 }));
    expect(created.status).toBe("created"); expect(other.status).toBe("created");
    expect((await t.query(catalogApi.queries.companyAddOns.list, authA))[0]).toMatchObject({ priceCents: 7300, pricingMethod: "starting_at" });
    expect((await t.mutation(catalogApi.mutations.companyAddOns.enablePreset, preset(authA, "interior_oven", "es", { priceCents: 9999 }))).status).toBe("already_enabled");
    await t.mutation(catalogApi.mutations.companyAddOns.update, custom(authA, { addOnId: created.addOnId, name: "My edited oven" }));
    await t.mutation(catalogApi.mutations.companyAddOns.archive, { ...authA, addOnId: created.addOnId });
    const restored = await t.mutation(catalogApi.mutations.companyAddOns.enablePreset, preset(authA, "interior_oven", "es", { priceCents: 9999 }));
    expect(restored).toMatchObject({ addOnId: created.addOnId, status: "restored" });
    const rowsA = await t.query(catalogApi.queries.companyAddOns.list, { ...authA, includeArchived: true });
    const rowsB = await t.query(catalogApi.queries.companyAddOns.list, { ...authB, includeArchived: true });
    expect(rowsA[0]).toMatchObject({ name: "My edited oven", priceCents: 2500, pricingMethod: "flat" }); expect(rowsB[0]).toMatchObject({ name: "Limpieza interior del horno", priceCents: 9100 });
    expect(COMPANY_ADD_ON_PRESETS.find((p) => p.presetKey === "interior_oven")?.en.name).toBe("Interior oven cleaning");
    expect(COMPANY_ADD_ON_PRESETS.every((definition) => !("suggestedPriceCents" in definition))).toBe(true);
    await expect(t.mutation(catalogApi.mutations.companyAddOns.enablePreset, preset(authA, "retired", "en"))).rejects.toThrow("Unknown or retired");
    await expect(t.mutation(catalogApi.mutations.companyAddOns.enablePreset, preset(authA, "laundry", "en", { pricingMethod: "per_unit", unitLabel: undefined }))).rejects.toThrow("Unit label is required");
    await expect(t.mutation(catalogApi.mutations.companyAddOns.enablePreset, preset(authA, "laundry", "en", { priceCents: 0 }))).rejects.toThrow("positive whole number");
  });

  it("handles lifecycle, deterministic ordering, public projection, audit, and legacy site isolation", async () => {
    const t = backend(); const s = await seed(t); const signed = await login(t, "owner-a@catalog.test"); const auth = { userId: s.ownerA, sessionToken: signed.sessionToken };
    const first = await t.mutation(catalogApi.mutations.companyAddOns.create, custom(auth, { name: "Private" }));
    const second = await t.mutation(catalogApi.mutations.companyAddOns.create, custom(auth, { name: "Public", isPublic: true }));
    const ownerB = await login(t, "owner-b@catalog.test");
    const foreign = await t.mutation(catalogApi.mutations.companyAddOns.create, custom({ userId: s.ownerB, sessionToken: ownerB.sessionToken }, { name: "Foreign" }));
    await t.mutation(catalogApi.mutations.companyAddOns.reorder, { ...auth, orderedIds: [second, first] });
    expect((await t.query(catalogApi.queries.companyAddOns.list, auth)).map((r: any) => r._id)).toEqual([second, first]);
    await expect(t.mutation(catalogApi.mutations.companyAddOns.reorder, { ...auth, orderedIds: [first, first] })).rejects.toThrow("Duplicate");
    await expect(t.mutation(catalogApi.mutations.companyAddOns.reorder, { ...auth, orderedIds: [first] })).rejects.toThrow("every non-archived");
    await expect(t.mutation(catalogApi.mutations.companyAddOns.reorder, { ...auth, orderedIds: [first, foreign] })).rejects.toThrow("foreign");
    await expect(t.mutation(catalogApi.mutations.companyAddOns.update, custom(auth, { addOnId: foreign }))).rejects.toThrow("access denied");
    await t.mutation(catalogApi.mutations.companyAddOns.archive, { ...auth, addOnId: first });
    const archived = (await t.query(catalogApi.queries.companyAddOns.list, { ...auth, includeArchived: true })).find((r: any) => r._id === first);
    expect(archived).toMatchObject({ isActive: false, isPublic: false }); expect(archived.archivedAt).toBeTypeOf("number");
    await t.mutation(catalogApi.mutations.companyAddOns.restore, { ...auth, addOnId: first });
    expect((await t.query(catalogApi.queries.companyAddOns.list, auth)).map((r: any) => r._id)).toEqual([second, first]);
    const projection = await t.query(catalogApi.queries.companyAddOns.listPublic, { slug: "catalog-a" });
    expect(projection).toEqual([{ addOnId: second, name: "Public", description: "Description", pricingMethod: "flat", priceCents: 2500, unitLabel: null, estimatedDurationMinutes: null, displayOrder: 0 }]);
    expect(Object.keys(projection[0])).not.toEqual(expect.arrayContaining(["companyId", "presetKey", "internalNotes", "createdByUserId", "archivedByUserId"]));
    const audits = await t.run((ctx) => ctx.db.query("auditLog").withIndex("by_companyId_timestamp", (q) => q.eq("companyId", s.companyA)).collect());
    expect(audits.map((entry) => entry.action)).toEqual(expect.arrayContaining(["create_company_add_on", "reorder_company_add_ons", "archive_company_add_on", "restore_company_add_on"]));
    const site = await t.run((ctx) => ctx.db.query("companySites").withIndex("by_slug", (q) => q.eq("slug", "catalog-a")).first());
    expect(site?.services).toEqual(["Legacy service"]);
  });

  it("projects only eligible public add-ons in deterministic order for every pricing method", async () => {
    const t = backend(); const s = await seed(t);
    const ids = await t.run(async (ctx) => {
      const base = { companyId: s.companyA, description: undefined, priceCents: 5000, unitLabel: undefined, isActive: true, isPublic: true, createdByUserId: s.ownerA, updatedAt: 100 };
      const starting = await ctx.db.insert("companyAddOns", { ...base, name: "Starting", pricingMethod: "starting_at", displayOrder: 0, createdAt: 20 });
      const flat = await ctx.db.insert("companyAddOns", { ...base, name: "Flat", description: "Flat description", pricingMethod: "flat", displayOrder: 0, createdAt: 10 });
      const perUnit = await ctx.db.insert("companyAddOns", { ...base, name: "Windows", pricingMethod: "per_unit", priceCents: 800, unitLabel: "window", displayOrder: 1, createdAt: 30 });
      await ctx.db.insert("companyAddOns", { ...base, name: "Private", pricingMethod: "flat", isPublic: false, displayOrder: 2, createdAt: 40 });
      await ctx.db.insert("companyAddOns", { ...base, name: "Inactive", pricingMethod: "flat", isActive: false, displayOrder: 3, createdAt: 50 });
      await ctx.db.insert("companyAddOns", { ...base, name: "Archived", pricingMethod: "flat", archivedAt: 60, displayOrder: 4, createdAt: 60 });
      await ctx.db.insert("companyAddOns", { ...base, companyId: s.companyB, name: "Foreign", pricingMethod: "flat", createdByUserId: s.ownerB, displayOrder: 0, createdAt: 5 });
      return { flat, starting, perUnit };
    });

    const projection = await t.query(catalogApi.queries.companyAddOns.listPublic, { slug: "catalog-a" });
    expect(projection).toEqual([
      { addOnId: ids.flat, name: "Flat", description: "Flat description", pricingMethod: "flat", priceCents: 5000, unitLabel: null, estimatedDurationMinutes: null, displayOrder: 0 },
      { addOnId: ids.starting, name: "Starting", description: null, pricingMethod: "starting_at", priceCents: 5000, unitLabel: null, estimatedDurationMinutes: null, displayOrder: 0 },
      { addOnId: ids.perUnit, name: "Windows", description: null, pricingMethod: "per_unit", priceCents: 800, unitLabel: "window", estimatedDurationMinutes: null, displayOrder: 1 },
    ]);
    for (const item of projection) {
      expect(Object.keys(item)).not.toEqual(expect.arrayContaining(["companyId", "internalNotes", "presetKey", "createdByUserId", "archivedByUserId", "createdAt", "updatedAt", "archivedAt"]));
    }
    await expect(t.query(catalogApi.queries.companyAddOns.listPublic, { slug: "missing-site" })).resolves.toEqual([]);
  });
});
