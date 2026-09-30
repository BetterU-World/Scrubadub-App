import { makeFunctionReference, type FunctionArgs, type FunctionReturnType } from "convex/server";
import type { api as generatedApi } from "../../../convex/_generated/api";
import type { MiniSiteFacts } from "../../../convex/lib/miniSiteSeo";

// Convex's generated api.js exports references built from anyApi. Construct
// these two references locally so Vercel does not need that file at runtime.
type SiteQueries = typeof generatedApi.queries.companySites;
export const getBySlug = makeFunctionReference<
  "query",
  FunctionArgs<SiteQueries["getBySlug"]>,
  FunctionReturnType<SiteQueries["getBySlug"]>
>("queries/companySites:getBySlug");
export const listPublishedSlugs = makeFunctionReference<
  "query",
  FunctionArgs<SiteQueries["listPublishedSlugs"]>,
  FunctionReturnType<SiteQueries["listPublishedSlugs"]>
>("queries/companySites:listPublishedSlugs");
export type { MiniSiteFacts };

export const MINI_SITE_ORIGIN = "https://scrubscrubscrub.com";

// Keep this list in sync with convex/lib/slugs.ts. The API function must not
// import that module at runtime: it is outside the Vercel project root.
export const RESERVED_SLUGS = new Set([
  "login", "signup", "admin", "api", "r", "invite", "forgot-password",
  "reset-password", "subscribe", "billing", "jobs", "properties",
  "employees", "calendar", "red-flags", "performance", "analytics",
  "partners", "requests", "audit-log", "notifications", "manuals", "site",
  "cleaner-leads", "showcase", "giveaway", "assessment", "contact", "terms",
  "privacy", "get-started", "setup", "affiliate", "availability", "owner",
  "settings", "payments", "internal", "clients", "commercial-accounts",
  "commercial-invoices", "invoices", "feedback", "financials",
  "inventory-templates", "c", "proposal", "cleaning-business-software",
  "airbnb-cleaning-software", "cleaning-company-management-software",
  "cleaning-checklist-app", "janitorial-software", "maid-service-software",
  "commercial-cleaning-software", "house-cleaning-business-software",
]);

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

export function validMiniSiteSlug(slug: string) {
  return SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug);
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
