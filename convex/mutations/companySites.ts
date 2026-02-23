import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireOwner } from "../lib/helpers";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

/** Reserved slugs that must not be claimed by any company. */
const RESERVED_SLUGS = new Set([
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

function validateSlug(slug: string) {
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
 * Create or update the company's mini-site.
 * One site per company (upsert by companyId).
 */
export const upsertSite = mutation({
  args: {
    userId: v.optional(v.id("users")),
    companyId: v.id("companies"),
    slug: v.string(),
    templateId: v.union(v.literal("A"), v.literal("B")),
    brandName: v.string(),
    bio: v.string(),
    serviceArea: v.string(),
    logoUrl: v.optional(v.string()),
    heroImageUrl: v.optional(v.string()),
    services: v.optional(v.array(v.string())),
    publicEmail: v.optional(v.string()),
    publicPhone: v.optional(v.string()),
    metaDescription: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireOwner(ctx, args.userId);
    if (user.companyId !== args.companyId) {
      throw new Error("Access denied");
    }

    const slug = args.slug.trim().toLowerCase();
    validateSlug(slug);

    // Check slug uniqueness (exclude own site)
    const slugHolder = await ctx.db
      .query("companySites")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();

    const existing = await ctx.db
      .query("companySites")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .first();

    if (slugHolder && slugHolder._id !== existing?._id) {
      throw new Error("This slug is already taken.");
    }

    // Validate & sanitize services list
    const services = (args.services ?? [])
      .map((s) => s.trim().slice(0, 60))
      .filter((s) => s.length > 0)
      .slice(0, 8);

    const data = {
      companyId: args.companyId,
      slug,
      templateId: args.templateId,
      brandName: args.brandName.trim(),
      bio: args.bio.trim(),
      serviceArea: args.serviceArea.trim(),
      logoUrl: args.logoUrl,
      heroImageUrl: args.heroImageUrl,
      services: services.length > 0 ? services : undefined,
      publicEmail: args.publicEmail?.trim() || undefined,
      publicPhone: args.publicPhone?.trim() || undefined,
      metaDescription: args.metaDescription?.trim().slice(0, 160) || undefined,
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
      return existing._id;
    }

    return await ctx.db.insert("companySites", data);
  },
});
