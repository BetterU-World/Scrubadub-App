import { describe, expect, it } from "vitest";
import { getFunctionName } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { RESERVED_SLUGS as sharedReservedSlugs } from "../../../convex/lib/slugs";
import {
  MINI_SITE_ORIGIN as sharedOrigin,
  miniSiteCanonical as sharedCanonical,
  miniSiteDescription as sharedDescription,
  miniSiteTitle as sharedTitle,
  safePublicImage as sharedImage,
  validMiniSiteSlug as sharedValidSlug,
} from "../../../convex/lib/miniSiteSeo";
import {
  MINI_SITE_ORIGIN,
  RESERVED_SLUGS,
  getBySlug,
  listPublishedSlugs,
  miniSiteCanonical,
  miniSiteDescription,
  miniSiteTitle,
  safePublicImage,
  validMiniSiteSlug,
} from "../api/_miniSiteRuntime";

describe("Vercel-local mini-site helpers", () => {
  it("keeps the API route rules aligned with Convex and React", () => {
    expect(getFunctionName(getBySlug)).toBe(getFunctionName(api.queries.companySites.getBySlug));
    expect(getFunctionName(listPublishedSlugs)).toBe(getFunctionName(api.queries.companySites.listPublishedSlugs));
    expect(MINI_SITE_ORIGIN).toBe(sharedOrigin);
    expect([...RESERVED_SLUGS].sort()).toEqual([...sharedReservedSlugs].sort());
    for (const slug of ["scrubadubsolutionsllc", "showcase", "login", "bad_slug", "ab", "a".repeat(51)]) {
      expect(validMiniSiteSlug(slug)).toBe(sharedValidSlug(slug));
      expect(miniSiteCanonical(slug)).toBe(sharedCanonical(slug));
    }
    const site = {
      brandName: "Scrubadub Solutions LLC",
      bio: "House cleaning",
      serviceArea: "Four Corners, FL",
      additionalServiceAreas: ["Davenport, FL"],
      services: ["Deep Clean"],
      metaDescription: null,
    };
    expect(miniSiteTitle(site)).toBe(sharedTitle(site));
    expect(miniSiteDescription(site)).toBe(sharedDescription(site));
    for (const image of [null, "http://example.com/a.png", "https://example.com/a.png", "invalid"]) {
      expect(safePublicImage(image)).toBe(sharedImage(image));
    }
  });
});
