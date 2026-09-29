import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { isMiniSitePublished, miniSiteDescription, normalizedAdditionalAreas, validMiniSiteSlug } from "../miniSiteSeo";
import { renderMiniSiteHtml } from "../../../packages/frontend/api/_miniSiteHtml";
import { renderSitemap } from "../../../packages/frontend/api/sitemap";

const modules = import.meta.glob("../../**/*.ts");
const backend = () => convexTest(schema, modules);

describe("mini-site SEO public facts", () => {
  it("keeps configured legacy sites public and empty auto-created sites drafts", () => {
    expect(isMiniSitePublished({ bio: "", serviceArea: "", services: [] })).toBe(false);
    expect(isMiniSitePublished({ bio: "Real business", serviceArea: "", services: [] })).toBe(true);
    expect(isMiniSitePublished({ bio: "", serviceArea: "", publicEmail: "public@example.test" })).toBe(true);
    expect(isMiniSitePublished({ isPublished: false, bio: "Real business", serviceArea: "Here" })).toBe(false);
    expect(isMiniSitePublished({ isPublished: true, bio: "", serviceArea: "" })).toBe(false);
  });

  it("whitelists public contact and excludes private contact and address", async () => {
    const t = backend();
    const { slug } = await t.run(async ctx => {
      const companyId = await ctx.db.insert("companies", { name: "Private Legal Name", timezone: "America/New_York", contactEmail: "owner@private.test", contactPhone: "555-PRIVATE" });
      await ctx.db.insert("companySettings", { companyId, address: "42 Private Lane", createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("companySites", { companyId, slug: "public-cleaning", templateId: "A", brandName: "Public Cleaning", bio: "We clean homes.", serviceArea: "Davenport, FL", additionalServiceAreas: ["Clermont, FL"], publicEmail: "hello@public.test", publicPhone: "555-PUBLIC", services: ["Home cleaning"], isPublished: true });
      return { slug: "public-cleaning" };
    });
    const site = await t.query(api.queries.companySites.getBySlug, { slug });
    expect(site).toMatchObject({ publicEmail: "hello@public.test", publicPhone: "555-PUBLIC", additionalServiceAreas: ["Clermont, FL"], services: ["Home cleaning"] });
    const serialized = JSON.stringify(site);
    expect(serialized).not.toMatch(/owner@private|555-PRIVATE|42 Private Lane/);
    expect((await t.query(api.queries.companySites.listPublishedSlugs, {})).slugs).toContain(slug);
  });

  it("bounds service areas and rejects invalid or reserved slugs", () => {
    expect(normalizedAdditionalAreas(["Davenport, FL", " Clermont, FL ", "clermont, fl", "Kissimmee, FL", "A", "B", "C", "D", "E"], "Davenport, FL")).toEqual(["Clermont, FL", "Kissimmee, FL", "A", "B", "C", "D"]);
    expect(validMiniSiteSlug("showcase")).toBe(false);
    expect(validMiniSiteSlug("bad_slug")).toBe(false);
  });

  it("filters drafts, invalid slugs, and QA fixtures from the public sitemap feed", async () => {
    const t = backend();
    await t.run(async ctx => {
      const real = await ctx.db.insert("companies", { name: "Real", timezone: "America/New_York" });
      const qa = await ctx.db.insert("companies", { name: "QA", timezone: "America/New_York", qaFixtureKey: "fixture" });
      for (const [companyId, slug, isPublished] of [[real, "real-cleaning", true], [real, "draft-cleaning", false], [real, "showcase", true], [qa, "qa-cleaning", true]] as const) {
        await ctx.db.insert("companySites", { companyId, slug, templateId: "A", brandName: slug, bio: "Description", serviceArea: "Davenport, FL", isPublished });
      }
    });
    expect((await t.query(api.queries.companySites.listPublishedSlugs, {})).slugs).toEqual(["real-cleaning"]);
    expect(await t.query(api.queries.companySites.getBySlug, { slug: "draft-cleaning" })).toBeNull();
  });

  it("renders company HTML and metadata from confirmed facts only", () => {
    const template = readFileSync("packages/frontend/index.html", "utf8");
    const site = { slug: "public-cleaning", templateId: "A" as const, brandName: "Public Cleaning", bio: "We clean homes.", serviceArea: "Davenport, FL", additionalServiceAreas: ["Clermont, FL"], services: ["Home cleaning"], publicEmail: "hello@public.test", publicPhone: null, logoUrl: null, heroImageUrl: null, metaDescription: null, publicRequestToken: null };
    const html = renderMiniSiteHtml(template, site);
    expect(html).toContain("<h1>Public Cleaning</h1>");
    expect(html).toContain("Davenport, FL, Clermont, FL");
    expect(html).toContain("<li>Home cleaning</li>");
    expect(html).toContain("<title>Public Cleaning | Professional Cleaning in Davenport, FL</title>");
    expect(html).toContain('rel="canonical" href="https://scrubscrubscrub.com/public-cleaning"');
    expect(html).toContain('property="og:url" content="https://scrubscrubscrub.com/public-cleaning"');
    expect(html).toContain('name="twitter:title"');
    expect(html).toContain('type="application/ld+json"');
    expect(html).toContain('"@type":"LocalBusiness"');
    expect(html).not.toContain("owner@private.test");
    expect(html).not.toContain("Standard Clean");
    expect(miniSiteDescription({ ...site, services: [], additionalServiceAreas: [], serviceArea: "", bio: "" })).not.toContain("Serving");
  });

  it("omits private routes from the sitemap", () => {
    const xml = renderSitemap(["public-cleaning"]);
    expect(xml).toContain("https://scrubscrubscrub.com/public-cleaning");
    expect(xml).not.toMatch(/\/login|\/signup|\/cleaner|\/r\//);
  });
});
