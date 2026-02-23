import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireOwner } from "../lib/helpers";

/**
 * Public query – load a mini-site by its slug.
 * Also returns the company's publicRequestToken so the public page can
 * link to /r/:token.  companyId is NOT exposed.
 */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const site = await ctx.db
      .query("companySites")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!site) return null;

    const company = await ctx.db.get(site.companyId);
    if (!company) return null;

    return {
      slug: site.slug,
      templateId: site.templateId,
      brandName: site.brandName,
      bio: site.bio,
      serviceArea: site.serviceArea,
      logoUrl: site.logoUrl,
      heroImageUrl: site.heroImageUrl,
      publicRequestToken: company.publicRequestToken ?? null,
      services: site.services ?? [],
      publicEmail: site.publicEmail ?? null,
      publicPhone: site.publicPhone ?? null,
      metaDescription: site.metaDescription ?? null,
    };
  },
});

/**
 * Auth-gated query – get the current company's site config for the
 * owner setup page.  Returns null if no site has been created yet.
 */
export const getMySite = query({
  args: {
    companyId: v.id("companies"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const user = await requireOwner(ctx, args.userId);
    if (user.companyId !== args.companyId) {
      throw new Error("Access denied");
    }

    return await ctx.db
      .query("companySites")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .first();
  },
});

/**
 * Public query – check whether a slug is already taken.
 * Used for real-time validation in the setup form.
 */
export const isSlugAvailable = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("companySites")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    return !existing;
  },
});
