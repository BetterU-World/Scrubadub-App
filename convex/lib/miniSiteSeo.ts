import { RESERVED_SLUGS, SLUG_RE } from "./slugs";

export const MINI_SITE_ORIGIN = "https://scrubscrubscrub.com";
export const MAX_ADDITIONAL_AREAS = 6;

export type MiniSiteFacts = {
  slug: string;
  templateId: "A" | "B";
  brandName: string;
  bio: string;
  serviceArea: string;
  additionalServiceAreas: string[];
  services: string[];
  logoUrl: string | null;
  heroImageUrl: string | null;
  publicEmail: string | null;
  publicPhone: string | null;
  metaDescription: string | null;
  publicRequestToken: string | null;
  searchIndexEligible?: boolean;
};

export function validMiniSiteSlug(slug: string) {
  return SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug);
}

export function normalizedAdditionalAreas(values: string[], primary: string) {
  const seen = new Set([primary.trim().toLocaleLowerCase()]);
  return values.map(value => value.trim().slice(0, 80)).filter(value => {
    const key = value.toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_ADDITIONAL_AREAS);
}

export function isMiniSitePublished(site: { isPublished?: boolean; bio: string; serviceArea: string; services?: string[]; publicEmail?: string; publicPhone?: string; logoUrl?: string; heroImageUrl?: string; metaDescription?: string }) {
  const configured = Boolean(site.bio.trim() || site.serviceArea.trim() || site.services?.length || site.publicEmail || site.publicPhone || site.logoUrl || site.heroImageUrl || site.metaDescription);
  if (site.isPublished !== undefined) return site.isPublished && configured;
  // Legacy sites had no publication field. Preserve configured sites while
  // excluding untouched auto-provisioned records from search and public HTML.
  return configured;
}

export function miniSiteTitle(site: Pick<MiniSiteFacts, "brandName" | "serviceArea">) {
  return site.serviceArea.trim()
    ? `${site.brandName} | Professional Cleaning in ${site.serviceArea}`
    : `${site.brandName} | Cleaning Services`;
}

export function miniSiteDescription(site: Pick<MiniSiteFacts, "brandName" | "bio" | "serviceArea" | "additionalServiceAreas" | "services" | "metaDescription">) {
  if (site.metaDescription?.trim()) return site.metaDescription.trim().slice(0, 160);
  const areas = [site.serviceArea, ...site.additionalServiceAreas].filter(Boolean);
  const parts = [site.brandName, site.bio.trim(), areas.length ? `Serving ${areas.join(", ")}.` : "", site.services.length ? `Services: ${site.services.join(", ")}.` : ""];
  return parts.filter(Boolean).join(" ").slice(0, 160).trim();
}

export function miniSiteCanonical(slug: string) {
  return `${MINI_SITE_ORIGIN}/${slug}`;
}

export function safePublicImage(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
