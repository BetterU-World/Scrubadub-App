import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireOwner } from "../lib/helpers";
import { validateSlug } from "../lib/slugs";

/** Generate a random hex token (no Node crypto required). */
function generateRandomToken(length = 40): string {
  const chars = "abcdef0123456789";
  let token = "";
  for (let i = 0; i < length; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
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

/**
 * Ensure the company has a publicRequestToken.
 * If one exists, returns it. Otherwise generates and persists a new one.
 * Owner-only; scoped to the owner's company.
 */
export const ensurePublicRequestToken = mutation({
  args: {
    userId: v.id("users"),
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    const user = await requireOwner(ctx, args.userId);
    if (user.companyId !== args.companyId) {
      throw new Error("Access denied");
    }

    const company = await ctx.db.get(args.companyId);
    if (!company) throw new Error("Company not found");

    if (company.publicRequestToken) {
      return { token: company.publicRequestToken, generated: false };
    }

    const token = generateRandomToken();
    await ctx.db.patch(args.companyId, { publicRequestToken: token });
    return { token, generated: true };
  },
});
