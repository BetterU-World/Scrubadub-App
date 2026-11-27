import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { MINI_SITE_SECTIONS, publicMiniSiteSections, resolveMiniSiteSections, SECTION_LIMITS } from "../miniSiteSections";
import { hashToken } from "../tokens";
import { safeMiniSiteProfile, SITE_CONTENT_LIMITS, type MiniSitePresentation, type MiniSiteProfile } from "../miniSitePresentation";
import { EMPTY_MEDIA, MEDIA_LIMITS, type MediaConfig, type MediaPurpose } from "../micrositeMediaModel";

const modules = import.meta.glob("../../**/*.ts");
afterEach(() => vi.unstubAllEnvs());
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
      "businessHours", "socialProfiles", "policies", "gallery", "team",
    ]);
    expect(publicMiniSiteSections(outdated)[0]).toEqual({ id: "highlights", entries: [{ title: "Title", body: "Body" }] });
  });
});

describe("managed microsite media", () => {
  const sections = [{ id: "gallery", enabled: true }, { id: "team", enabled: true }];
  const mediaApi = api.micrositeMedia;
  const ops = internal.micrositeMedia;
  const bytes = new Uint8Array([1, 2, 3]);
  const mime = "image/webp" as const;

  async function stage(test: Awaited<ReturnType<typeof fixture>>["test"], sessionToken: string, requestId: string, purpose: MediaPurpose = "gallery") {
    const ticket = await test.mutation(mediaApi.begin, { sessionToken, requestId, purpose, bytes: bytes.length, mime });
    const claim = await test.mutation(ops.claim, { sessionToken, assetId: ticket.assetId, bytes: bytes.length });
    if ("ready" in claim) throw new Error("Unexpected replay");
    const storageId = await test.run((ctx) => ctx.storage.store(new Blob([bytes], { type: `${mime}; scrub-site-media=${claim.tag}` })));
    await test.run((ctx) => ctx.db.patch(storageId, { contentType: `${mime}; scrub-site-media=${claim.tag}` }));
    await test.mutation(ops.finish, { assetId: ticket.assetId, lease: claim.lease, storageId, width: 20, height: 16, bytes: bytes.length, mime });
    return { assetId: ticket.assetId, storageId, tag: claim.tag };
  }

  it("publishes ordered mixed entries, hides incomplete and disabled entries, and checks the exact slot on delivery", async () => {
    vi.stubEnv("CONVEX_SITE_URL", "https://media.example.test");
    const { test, owner, companyId } = await fixture();
    const first = await stage(test, owner.sessionToken, "photo-one");
    const before = await stage(test, owner.sessionToken, "pair-before");
    const after = await stage(test, owner.sessionToken, "pair-after");
    const portrait = await stage(test, owner.sessionToken, "team-portrait", "portrait");
    const p = (assetId: Id<"micrositeMediaAssets">, alt: string) => ({ assetId, alt });
    const media: MediaConfig = {
      gallery: [
        { id: "pair", kind: "pair", title: "Kitchen", caption: "A fresh start", enabled: true, before: p(before.assetId, "Before"), after: p(after.assetId, "After") },
        { id: "photo", kind: "photo", title: "Sink", caption: "", enabled: true, image: p(first.assetId, "Clean sink") },
        { id: "incomplete", kind: "pair", title: "Incomplete", caption: "", enabled: true, before: p(before.assetId, "Not finished") },
        { id: "hidden", kind: "photo", title: "Hidden", caption: "", enabled: false, image: p(first.assetId, "Hidden") },
      ],
      team: [
        { id: "person", name: "Alex", role: "Owner", bio: "Local cleaner", enabled: true, portrait: p(portrait.assetId, "") },
        { id: "no-portrait", name: "Jo", role: "Cleaner", bio: "", enabled: true },
      ],
    };
    const write = api.mutations.companySites.upsertSite;
    const lookup = () => test.query(api.queries.companySites.getBySlug, { slug: siteFields.slug });
    const save = (change: Partial<{ media: MediaConfig; sections: typeof sections; isPublished: boolean }> = {}) =>
      test.mutation(write, { ...siteFields, companyId, ...owner, sections, media, ...change });
    expect(await lookup()).not.toHaveProperty("media");
    expect((await test.fetch("/microsite-media/bright-homes/gallery/pair/before/unknown")).status).toBe(404);
    await save();
    const view = (await lookup())!.media!;
    expect(view.gallery.map(({ id }) => id)).toEqual(["pair", "photo"]);
    expect(view.team[0].portrait?.alt).toBe("Alex");
    expect(view.team[1]).not.toHaveProperty("portrait");
    expect(JSON.stringify(view)).not.toMatch(/_storage|storageId|assetId|Incomplete|Hidden/);
    expect(await test.query(api.queries.companySites.getMySite, { companyId, ...owner })).toMatchObject({ media });
    const pair = view.gallery[0];
    if (pair.kind !== "pair") throw new Error("Pair missing");
    const beforePath = new URL(pair.before.url).pathname;
    const response = await test.fetch(beforePath);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toBe(mime);
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual(Array.from(bytes));
    expect((await test.fetch(beforePath.replace("/before/", "/after/"))).status).toBe(404);
    await test.mutation(ops.setDeliverySuspension, { companyId, suspended: true });
    expect((await test.fetch(beforePath)).status).toBe(404);
    expect((await lookup())?.media?.team[0]).not.toHaveProperty("portrait");
    await test.mutation(ops.setDeliverySuspension, { companyId, suspended: false });
    await save({ isPublished: false });
    expect((await test.fetch(beforePath)).status).toBe(404);
    await save({ sections: [{ id: "gallery", enabled: false }, sections[1]] });
    expect((await test.fetch(beforePath)).status).toBe(404);
    await save({ media: { ...media, gallery: [{ ...media.gallery[0], enabled: false }] } });
    expect((await test.fetch(beforePath)).status).toBe(404);
    const original = media.gallery[0];
    if (original.kind !== "pair") throw new Error("Pair missing");
    await save({ media: { ...media, gallery: [{ ...original, before: original.after, after: original.before }] } });
    expect((await test.fetch(beforePath)).status).toBe(404);
    const swapped = (await lookup())!.media!.gallery[0];
    expect(swapped.kind === "pair" && swapped.before.alt).toBe("After");
  });

  it("rejects unauthorized uploads, preview, cross-tenant references and over-quota reservations", async () => {
    const { test, owner, manager, otherOwner, otherCompany, companyId } = await fixture();
    const request = { requestId: "auth-check", bytes: 200_000, mime, purpose: "gallery" as const };
    await expect(test.mutation(mediaApi.begin, { ...request, sessionToken: "" })).rejects.toThrow();
    await expect(test.mutation(mediaApi.begin, { ...request, sessionToken: manager.sessionToken })).rejects.toThrow("Owner session required");
    await expect(test.mutation(mediaApi.begin, { ...request, sessionToken: owner.sessionToken, bytes: 600_001 })).rejects.toThrow("Invalid image size");
    const outside = await stage(test, otherOwner.sessionToken, "outside-photo");
    expect(await test.query(ops.previewFile, { sessionToken: owner.sessionToken, assetId: outside.assetId })).toBeNull();
    await expect(test.mutation(api.mutations.companySites.upsertSite, {
      ...siteFields, ...owner, companyId, sections,
      media: { gallery: [{ id: "photo", kind: "photo", enabled: true, title: "", caption: "", image: { assetId: outside.assetId, alt: "Photo" } }], team: [] },
    })).rejects.toThrow("image is unavailable");
    await expect(test.mutation(api.mutations.companySites.upsertSite, {
      ...siteFields, ...manager, companyId, sections, media: EMPTY_MEDIA,
    })).rejects.toThrow("Owner session required");
    await expect(test.mutation(api.mutations.companySites.upsertSite, {
      ...siteFields, ...owner, companyId: otherCompany, sections, media: EMPTY_MEDIA,
    })).rejects.toThrow("Access denied");
    for (let i = 0; i < 8; i++) await test.mutation(mediaApi.begin, { ...request, sessionToken: owner.sessionToken, requestId: `reserve-${i}` });
    await expect(test.mutation(mediaApi.begin, { ...request, sessionToken: owner.sessionToken })).rejects.toThrow("pending images");
    const replay = await test.mutation(mediaApi.begin, { ...request, sessionToken: owner.sessionToken, requestId: "reserve-0" });
    expect(replay.ready).toBeNull();
    const claimArgs = { sessionToken: owner.sessionToken, assetId: replay.assetId, bytes: request.bytes };
    for (let attempt = 0; attempt < 3; attempt++) {
      const claim = await test.mutation(ops.claim, claimArgs);
      if (!claim.lease) throw new Error("Expected an upload lease");
      await test.mutation(ops.release, { assetId: replay.assetId, lease: claim.lease });
    }
    await expect(test.mutation(ops.claim, claimArgs)).rejects.toThrow("retry limit");
    await test.run(async (ctx) => {
      const pending = await ctx.db.query("micrositeMediaAssets").withIndex("by_company_state_expiry", (q) => q.eq("companyId", companyId).eq("state", "pending")).take(8);
      for (const asset of pending) await ctx.db.patch(asset._id, { expiresAt: 0 });
      const hour = await ctx.db.query("rateLimits").withIndex("by_key", (q) => q.eq("key", `microsite-media-hour:${companyId}`)).first();
      await ctx.db.patch(hour!._id, { count: MEDIA_LIMITS.uploadsPerHour });
    });
    await expect(test.mutation(mediaApi.begin, { ...request, sessionToken: owner.sessionToken })).rejects.toThrow("Rate limit exceeded");
  });

  it("keeps saved bytes through failed changes and discards only unreferenced or verified expired candidates", async () => {
    vi.stubEnv("CONVEX_SITE_URL", "https://media.example.test");
    const { test, owner, companyId } = await fixture();
    const old = await stage(test, owner.sessionToken, "saved-photo");
    const incoming = await stage(test, owner.sessionToken, "incoming-photo");
    const abandoned = await stage(test, owner.sessionToken, "abandoned-photo");
    const draft = (assetId: Id<"micrositeMediaAssets">): MediaConfig => ({
      gallery: [{ id: "photo", enabled: true, kind: "photo", title: "", caption: "", image: { assetId, alt: "Photo" } }], team: [],
    });
    const save = (media: MediaConfig) => test.mutation(api.mutations.companySites.upsertSite, { ...siteFields, ...owner, companyId, sections, media });
    await save(draft(old.assetId));
    const image = (await test.query(api.queries.companySites.getBySlug, { slug: siteFields.slug }))!.media!.gallery[0];
    if (image.kind !== "photo") throw new Error("Photo missing");
    const path = new URL(image.image.url).pathname;
    const invalid = draft(incoming.assetId);
    invalid.gallery.push(invalid.gallery[0]);
    await expect(save(invalid)).rejects.toThrow("identifier");
    await test.mutation(mediaApi.discard, { sessionToken: owner.sessionToken, assetId: old.assetId });
    expect((await test.fetch(path)).status).toBe(200);
    // Race a valid replacement with cleanup of another, expired staged image.
    await test.run((ctx) => ctx.db.patch(abandoned.assetId, { expiresAt: 0 }));
    await Promise.all([save(draft(incoming.assetId)), test.mutation(ops.cleanup, {})]);
    expect((await test.fetch(path)).status).toBe(404);
    expect(await test.run((ctx) => ctx.db.system.get("_storage", old.storageId))).not.toBeNull();
    expect(await test.run((ctx) => ctx.db.system.get("_storage", abandoned.storageId))).toBeNull();
    expect(await test.run((ctx) => ctx.db.system.get("_storage", incoming.storageId))).not.toBeNull();
    const orphan = await test.run((ctx) => ctx.storage.store(new Blob([bytes], { type: `${mime}; scrub-site-media=${abandoned.tag}` })));
    await test.run((ctx) => ctx.db.patch(orphan, { contentType: `${mime}; scrub-site-media=${abandoned.tag}` }));
    await expect(test.mutation(ops.reconcileOrphan, { assetId: abandoned.assetId, storageId: incoming.storageId })).rejects.toThrow("verified orphan");
    await expect(test.mutation(ops.reconcileOrphan, { assetId: abandoned.assetId, storageId: orphan })).resolves.toBe(true);
    await expect(test.mutation(ops.reconcileOrphan, { assetId: abandoned.assetId, storageId: orphan })).resolves.toBe(false);
  });
});

describe("microsite business presentation", () => {
  const description = "Dusting, floors, and kitchen surfaces.";
  const presentation: MiniSitePresentation = {
    serviceDetails: [{ index: 0, name: "Deep cleaning", description, included: "Kitchen", excluded: "Attic" }],
    hours: [{ day: "sunday", status: "closed" }, { day: "monday", status: "open", opens: "09:00", closes: "17:30" }, { day: "tuesday", status: "appointment" }],
    socials: [{ platform: "instagram", url: "https://www.instagram.com/bright.homes/" }],
    externalReviewsEnabled: true,
    externalReviews: [{ platform: "google", url: "https://www.google.com/maps/place/Bright+Homes" }],
    quote: { label: "Tell Us About Your Cleaning Needs", text: "Tell us how we can help." },
  };

  it("round-trips Phase 1 ordering and Phase 2 content, withholding hidden and incomplete entries", async () => {
    const { test, owner, companyId } = await fixture();
    const write = api.mutations.companySites.upsertSite;
    const publicQuery = api.queries.companySites.getBySlug;
    const phaseOne = [{ id: "faq", enabled: true, heading: "Your questions", entries: [{ id: "q", enabled: true, title: "Where?", body: "Tampa" }] }];
    await test.mutation(write, { ...siteFields, ...owner, companyId, sections: phaseOne });
    const settings = (await test.query(api.queries.companySites.getMySite, { ...owner, companyId }))!;
    const sections = [
      ...settings.sections!,
      { id: "businessHours", enabled: true },
      { id: "socialProfiles", enabled: true },
      { id: "policies", enabled: true, entries: [
        { id: "second", title: "Rescheduling", body: "Contact us to discuss changes.", enabled: true },
        { id: "hidden", title: "Hidden policy", body: "Private", enabled: false },
        { id: "incomplete", title: "Incomplete policy", body: "", enabled: true },
        { id: "first", title: "Access", body: "Tell us how to enter.", enabled: true },
      ] },
    ];
    await test.mutation(write, { ...siteFields, ...owner, companyId, sections, presentation });
    expect(await test.query(api.queries.companySites.getMySite, { ...owner, companyId })).toMatchObject({ sections, presentation });
    let site = (await test.query(publicQuery, { slug: siteFields.slug }))!;
    expect(site.publicRequestToken).toBe("bright-token");
    expect(site.sections[0]).toMatchObject({ id: "faq", heading: "Your questions" });
    expect(site.sections.find(({ id }) => id === "policies")?.entries?.map(({ title }) => title)).toEqual(["Rescheduling", "Access"]);
    expect(site.presentation?.hours?.map(({ day }) => day)).toEqual(["monday", "tuesday", "sunday"]);
    expect(site.presentation?.serviceDetails).toEqual([{ index: 0, description, included: "Kitchen", excluded: "Attic" }]);
    expect(site.presentation?.quote).toEqual(presentation.quote);
    expect(site.presentation?.socials).toEqual(presentation.socials);
    expect(site.presentation?.externalReviews).toEqual(presentation.externalReviews);

    const hiddenTypes = ["businessHours", "socialProfiles", "policies", "reviews", "services"];
    await test.mutation(write, { ...siteFields, ...owner, companyId, sections: [
      ...sections.filter(({ id }) => !hiddenTypes.includes(id)), ...hiddenTypes.map((id) => ({ id, enabled: false })),
    ], presentation });
    site = (await test.query(publicQuery, { slug: siteFields.slug }))!;
    expect(site.sections.some(({ id }) => hiddenTypes.includes(id))).toBe(false);
    expect(site.presentation).toEqual({ quote: presentation.quote });
    expect(JSON.stringify(site)).not.toMatch(/17:30|instagram|google.com|Hidden policy|Incomplete policy|Dusting/);
  });

  it("keeps presentation with legacy writes and removes details attached to a renamed service", async () => {
    const { test, owner, companyId } = await fixture();
    const write = api.mutations.companySites.upsertSite;
    await test.mutation(write, { ...siteFields, ...owner, companyId, presentation });
    await test.mutation(write, { ...siteFields, ...owner, companyId, bio: "Updated" });
    const site = await test.query(api.queries.companySites.getBySlug, { slug: siteFields.slug });
    expect(site?.presentation?.serviceDetails).toHaveLength(1);
    expect(site?.presentation).not.toHaveProperty("hours");
    expect(site?.presentation).not.toHaveProperty("socials");
    await test.mutation(write, { ...siteFields, ...owner, companyId, services: ["Move out"] });
    expect(await test.query(api.queries.companySites.getMySite, { ...owner, companyId })).toMatchObject({
      presentation: { ...presentation, serviceDetails: [] },
    });
  });

  it("omits headings and payloads for enabled but empty business hours and social profiles", async () => {
    const { test, owner, companyId } = await fixture();
    await test.mutation(api.mutations.companySites.upsertSite, {
      ...siteFields, ...owner, companyId, presentation: {},
      sections: [{ id: "businessHours", enabled: true, heading: "Hours draft" }, { id: "socialProfiles", enabled: true }],
    });
    const site = (await test.query(api.queries.companySites.getBySlug, { slug: siteFields.slug }))!;
    expect(site.sections.some(({ id }) => id === "businessHours" || id === "socialProfiles")).toBe(false);
    expect(site).not.toHaveProperty("presentation");
  });

  it("rejects unauthorized writes and invalid details, hours, profiles, and limits", async () => {
    const { test, owner, companyId, manager, otherOwner } = await fixture();
    const write = api.mutations.companySites.upsertSite;
    await expect(test.mutation(write, { ...siteFields, ...manager, companyId, presentation })).rejects.toThrow("Owner session required");
    await expect(test.mutation(write, { ...siteFields, ...otherOwner, companyId, presentation })).rejects.toThrow("Access denied");
    const bad: MiniSitePresentation[] = [
      { serviceDetails: [{ index: 0, name: "Unknown" }] },
      { serviceDetails: [{ index: 0, name: "Deep cleaning", description: "x".repeat(SITE_CONTENT_LIMITS.serviceText + 1) }] },
      { hours: [{ day: "monday", status: "open", opens: "18:00", closes: "07:00" }] },
      { hours: [{ day: "monday", status: "open", opens: "9:00", closes: "17:00" }] },
      { hours: [{ day: "monday", status: "closed" }, { day: "monday", status: "appointment" }] },
      { socials: [{ platform: "yelp", url: "https://www.yelp.com/biz/bright-homes" }] },
      { externalReviews: [{ platform: "google", url: "https://g.page/r/bright-homes/review" }] },
      { quote: { label: "x".repeat(SITE_CONTENT_LIMITS.quoteLabel + 1) } },
    ];
    for (const item of bad) {
      await expect(test.mutation(write, { ...siteFields, ...owner, companyId, presentation: item })).rejects.toThrow("INVALID_MINI_SITE_PRESENTATION");
    }
  });

  it.each<[MiniSiteProfile["platform"], string, boolean]>([
    ["facebook", "https://www.facebook.com/Bright.Homes", true],
    ["instagram", "https://www.instagram.com/bright.homes/", true],
    ["linkedin", "https://www.linkedin.com/company/bright-homes", true],
    ["tiktok", "https://www.tiktok.com/@brighthomes", true],
    ["youtube", "https://www.youtube.com/@brighthomes", true],
    ["google", "https://maps.app.goo.gl/AbcD", true],
    ["yelp", "https://www.yelp.com/biz/bright-homes", true],
    ["trustpilot", "https://www.trustpilot.com/review/bright-homes.example", true],
    ["instagram", "http://www.instagram.com/bright.homes/", false],
    ["instagram", "https://instagram.com.elsewhere.test/bright", false],
    ["instagram", "https://other.test@instagram.com/bright", false],
    ["instagram", "https://instagram.com:444/bright", false],
    ["youtube", "https://www.youtube.com/redirect?q=https://example.test", false],
    ["facebook", "https://www.facebook.com/l.php?u=https://example.test", false],
    ["google", "https://www.google.com/url?q=https://example.test", false],
    ["google", "https://g.page/r/bright/review", false],
    ["yelp", "javascript:alert(1)", false],
  ])("validates %s profile %s", (platform, url, valid) => {
    expect(Boolean(safeMiniSiteProfile({ platform, url }))).toBe(valid);
  });
});
