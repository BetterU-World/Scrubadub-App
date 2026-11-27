import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import schema from "../../schema";
import { MINI_SITE_SECTIONS, publicMiniSiteSections, resolveMiniSiteSections, SECTION_LIMITS } from "../miniSiteSections";
import { hashToken } from "../tokens";

const modules = import.meta.glob("../../**/*.ts");
const siteFields = {
  slug: "bright-homes",
  templateId: "A" as const,
  brandName: "Bright Homes",
  bio: "Local cleaners",
  serviceArea: "Tampa",
  additionalServiceAreas: ["Brandon"],
  isPublished: true,
  services: ["Deep cleaning"],
};

async function fixture() {
  const test = convexTest(schema, modules);
  const data = await test.run(async ({ db }) => {
    const companyId = await db.insert("companies", { name: "Bright Homes", timezone: "America/New_York", publicRequestToken: "bright-token" });
    const otherCompany = await db.insert("companies", { name: "Other Company", timezone: "America/New_York" });
    const siteId = await db.insert("companySites", { ...siteFields, companyId });
    const staff = async (sessionToken: string, role: "owner" | "manager", company = companyId) => {
      const userId = await db.insert("users", {
        email: `${sessionToken}@test.example`, name: role, role, companyId: company,
        passwordHash: "unused-test-hash", status: "active", canManageBusinessConfiguration: true,
      });
      const now = Date.now();
      await db.insert("authSessions", {
        principalType: "staff", userId, tokenHash: hashToken(sessionToken), version: 1,
        createdAt: now, lastUsedAt: now, expiresAt: now + 60_000, idleExpiresAt: now + 60_000,
      });
      return { userId, sessionToken };
    };
    const owner = await staff("owner", "owner");
    const manager = await staff("manager", "manager");
    const otherOwner = await staff("other-owner", "owner", otherCompany);
    for (const [name, isPublic, company, createdByUserId] of [
      ["Window cleaning", true, companyId, owner.userId],
      ["Private catalog entry", false, companyId, owner.userId],
      ["Other company's add-on", true, otherCompany, otherOwner.userId],
    ] as const) {
      await db.insert("companyAddOns", {
        companyId: company, name, isPublic, isActive: true, pricingMethod: "flat", priceCents: 2500,
        displayOrder: 0, createdAt: 1, updatedAt: 1, createdByUserId, internalNotes: "Private catalog notes",
      });
    }
    return { companyId, otherCompany, siteId, owner, manager, otherOwner };
  });
  return { test, ...data };
}

describe("microsite section configuration", () => {
  it("keeps legacy order and steps while new sites start without optional marketing content", async () => {
    const { test, owner, companyId, otherOwner, otherCompany } = await fixture();
    const query = api.queries.companySites.getBySlug;
    const legacy = (await test.query(query, { slug: siteFields.slug }))!;
    expect(legacy.sections.map(({ id }) => id)).toEqual(["services", "addOns", "howItWorks", "serviceArea", "reviews"]);
    expect(legacy.sections[2]).toEqual({ id: "howItWorks", legacyProcess: true });
    await test.mutation(api.mutations.companySites.upsertSite, { ...siteFields, companyId, ...owner });
    expect((await test.query(query, { slug: siteFields.slug }))?.sections).toEqual(legacy.sections);
    await test.mutation(api.mutations.companySites.upsertSite, {
      ...siteFields, slug: "new-cleaning-site", companyId: otherCompany, ...otherOwner,
    });
    const fresh = (await test.query(query, { slug: "new-cleaning-site" }))!;
    expect(fresh.sections.map(({ id }) => id)).toEqual(["services", "addOns", "serviceArea", "reviews"]);
  });

  it("round-trips ordered private settings and publishes only eligible text and supported icons", async () => {
    const { test, owner, companyId } = await fixture();
    const entries = [
      { id: "visible-2", title: "Second question?", body: "Answer two.", enabled: true },
      { id: "private", title: "Private question", body: "Private answer", enabled: false },
      { id: "draft", title: "Incomplete question", body: "  ", enabled: true },
      { id: "visible-1", title: "First question?", body: "Answer one.", enabled: true },
    ];
    const sections = [
      { id: "faq", enabled: true, heading: "Before your visit", entries },
      { id: "services", enabled: false },
      { id: "addOns", enabled: false },
      { id: "serviceArea", enabled: false },
      { id: "reviews", enabled: false },
      { id: "howItWorks", enabled: true, entries: [] },
      { id: "highlights", enabled: true, entries: [
        { id: "highlight-1", title: "Flexible visits", body: "Ask us about recurring visits.", enabled: true, icon: "calendar" },
      ] },
    ];
    await test.mutation(api.mutations.companySites.upsertSite, { ...siteFields, ...owner, companyId, sections });
    expect(await test.query(api.queries.companySites.getMySite, { ...owner, companyId })).toMatchObject({ sections });
    expect(await test.query(api.queries.companySites.getBySlug, { slug: siteFields.slug })).toMatchObject({
      services: [], additionalServiceAreas: [], serviceArea: "Tampa", publicRequestToken: "bright-token",
      sections: [
        { id: "faq", heading: "Before your visit", entries: [
          { title: "Second question?", body: "Answer two." },
          { title: "First question?", body: "Answer one." },
        ] },
        { id: "highlights", entries: [{ title: "Flexible visits", body: "Ask us about recurring visits.", icon: "calendar" }] },
      ],
    });
    const publicSite = await test.query(api.queries.companySites.getBySlug, { slug: siteFields.slug });
    expect(JSON.stringify(publicSite)).not.toMatch(/private|Incomplete question|visible-1|"enabled"|Deep cleaning|Brandon/i);
    const addOns = api.queries.companyAddOns.listPublic;
    expect(await test.query(addOns, { slug: siteFields.slug })).toEqual([]);
    expect((await test.query(addOns, { publicRequestToken: "bright-token" })).map(({ name }) => name)).toEqual(["Window cleaning"]);
  });

  it("enforces owner and tenant scope for reads, writes and preview data", async () => {
    const { test, owner, manager, otherOwner, companyId, otherCompany } = await fixture();
    const upsert = api.mutations.companySites.upsertSite;
    const get = api.queries.companySites.getMySite;
    const preview = api.queries.companySites.getPreviewContent;
    const previewOptions = { includeAddOns: true, includeReviews: true };
    await expect(test.mutation(upsert, { ...siteFields, ...manager, companyId })).rejects.toThrow("Owner session required");
    await expect(test.mutation(upsert, { ...siteFields, ...owner, companyId: otherCompany })).rejects.toThrow("Access denied");
    await expect(test.query(get, { ...otherOwner, companyId })).rejects.toThrow("Access denied");
    await expect(test.query(get, { ...manager, companyId })).rejects.toThrow("Owner session required");
    await expect(test.query(preview, { ...manager, ...previewOptions })).rejects.toThrow("Owner session required");
    await expect(test.query(preview, { sessionToken: "invalid", ...previewOptions })).rejects.toThrow();
    await expect(test.query(preview, { ...otherOwner, userId: owner.userId, ...previewOptions })).rejects.toThrow("does not match");
    const result = await test.query(preview, { ...owner, ...previewOptions });
    expect(result.addOns.map(({ name }) => name)).toEqual(["Window cleaning"]);
    expect(JSON.stringify(result)).not.toContain("Private catalog notes");
  });

  it("rejects unsupported identifiers, icons, duplicate entries and excess content on write", async () => {
    const { test, owner, companyId } = await fixture();
    const write = api.mutations.companySites.upsertSite;
    const entry = { id: "entry-1", enabled: true, title: "Title", body: "Body" };
    for (const sections of [
      [{ id: "retired", enabled: true }],
      [{ id: "services", enabled: true }, { id: "services", enabled: false }],
      [{ id: "services", enabled: true, entries: [entry] }],
      [{ id: "faq", enabled: true, heading: "x".repeat(SECTION_LIMITS.heading + 1) }],
      [{ id: "faq", enabled: true, entries: [entry, entry] }],
      [{ id: "faq", enabled: true, entries: [{ ...entry, id: "invalid id" }] }],
      [{ id: "faq", enabled: true, entries: [{ ...entry, body: "x".repeat(MINI_SITE_SECTIONS.faq.entryBodyLimit + 1) }] }],
      [{ id: "faq", enabled: true, entries: Array.from({ length: SECTION_LIMITS.entries + 1 }, (_, i) => ({ ...entry, id: `entry-${i}` })) }],
      [{ id: "highlights", enabled: true, entries: [{ ...entry, icon: "<svg>" }] }],
    ]) {
      await expect(test.mutation(write, { ...siteFields, ...owner, companyId, sections }))
        .rejects.toThrow("INVALID_MINI_SITE_SECTIONS");
    }
  });

  it("ignores retired section IDs and falls back safely for unknown icons and omitted settings", () => {
    const outdated = [
      { id: "retired", enabled: true },
      { id: "highlights", enabled: true, entries: [{ id: "one", enabled: true, title: "Title", body: "Body", icon: "old-icon" }] },
      { id: "highlights", enabled: false },
    ];
    expect(resolveMiniSiteSections(outdated).map(({ id }) => id)).toEqual([
      "highlights", "services", "addOns", "howItWorks", "serviceArea", "reviews", "faq",
    ]);
    expect(publicMiniSiteSections(outdated)[0]).toEqual({ id: "highlights", entries: [{ title: "Title", body: "Body" }] });
  });
});
