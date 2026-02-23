/**
 * Shared slug utilities for company mini-sites.
 * Used by both the owner upsertSite mutation and auto-provisioning.
 */

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

/** Reserved slugs that must not be claimed by any company. */
export const RESERVED_SLUGS = new Set([
  "login",
  "signup",
  "admin",
  "api",
  "r",
  "invite",
  "forgot-password",
  "reset-password",
  "subscribe",
  "billing",
  "jobs",
  "properties",
  "employees",
  "calendar",
  "red-flags",
  "performance",
  "analytics",
  "partners",
  "requests",
  "audit-log",
  "notifications",
  "manuals",
  "site",
  "cleaner-leads",
]);

export function validateSlug(slug: string) {
  if (!SLUG_RE.test(slug)) {
    throw new Error(
      "Slug must be 3–50 characters, lowercase letters, numbers, and hyphens only."
    );
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new Error("This slug is reserved. Please choose another.");
  }
}

/**
 * Turn an arbitrary string (e.g. company name) into a URL-safe slug.
 * Only keeps lowercase alphanumeric + hyphens, collapses runs, trims edges.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // non-alnum → hyphen
    .replace(/^-+|-+$/g, "")     // trim leading/trailing hyphens
    .slice(0, 50);               // keep within max length
}

/** Generate a random 4-char alphanumeric suffix. */
export function randomSuffix(len = 4): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < len; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}
