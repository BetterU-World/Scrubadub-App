import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireOwnerSession } from "../lib/sessionAuth";
import { isMiniSitePublished, normalizedAdditionalAreas, validMiniSiteSlug } from "../lib/miniSiteSeo";

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

    if (!site || !validMiniSiteSlug(args.slug) || !isMiniSitePublished(site)) return null;

    const company = await ctx.db.get(site.companyId);
    if (!company) return null;

    // Explicit public mini-site fields only. Company profile contact details
    // may be operational or personal and must never leak through this query.
    return {
      slug: site.slug,
      templateId: site.templateId,
      brandName: site.brandName,
      bio: site.bio,
      serviceArea: site.serviceArea,
      additionalServiceAreas: normalizedAdditionalAreas(site.additionalServiceAreas ?? [], site.serviceArea),
      logoUrl: site.logoUrl ?? null,
      heroImageUrl: site.heroImageUrl ?? null,
      publicRequestToken: company.publicRequestToken ?? null,
      services: site.services ?? [],
      publicEmail: site.publicEmail ?? null,
      publicPhone: site.publicPhone ?? null,
      metaDescription: site.metaDescription ?? null,
      searchIndexEligible: !company.qaFixtureKey,
    };
  },
});

/** Public sitemap feed with a deliberately small projection. */
export const listPublishedSlugs = query({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("companySites").paginate({ cursor: args.cursor ?? null, numItems: 200 });
    const slugs: string[] = [];
    for (const site of page.page) {
      if (!validMiniSiteSlug(site.slug) || !isMiniSitePublished(site)) continue;
      const company = await ctx.db.get(site.companyId);
      if (!company || company.qaFixtureKey) continue;
      slugs.push(site.slug);
    }
    return { slugs: slugs.sort(), continueCursor: page.continueCursor, isDone: page.isDone };
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
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    if (user.companyId !== args.companyId) {
      throw new Error("Access denied");
    }

    const site = await ctx.db
      .query("companySites")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .first();

    if (!site) return null;

    const company = await ctx.db.get(args.companyId);
    return {
      ...site,
      publicRequestToken: company?.publicRequestToken ?? null,
    };
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

/**
 * Public query – return reviewed client feedback for a company microsite.
 * Only shows status="reviewed" feedback. Strips contact emails/phones.
 * Returns first name or initial only.
 */
export const getReviewedFeedbackBySlug = query({
  args: { slug: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const site = await ctx.db
      .query("companySites")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!site || !isMiniSitePublished(site)) return [];

    // Get all company requests
    const requests = await ctx.db
      .query("clientRequests")
      .withIndex("by_companyId", (q) => q.eq("companyId", site.companyId))
      .collect();

    if (requests.length === 0) return [];

    const requestIds = new Set(requests.map((r) => r._id));
    const requestMap = new Map(requests.map((r) => [r._id, r]));

    // Fetch reviewed feedback (newest first)
    const allFeedback = await ctx.db
      .query("clientFeedback")
      .withIndex("by_status_createdAt", (q) => q.eq("status", "reviewed"))
      .order("desc")
      .collect();

    // Filter to this company's requests AND explicitly featured on site
    const companyFeedback = allFeedback.filter((f) =>
      requestIds.has(f.clientRequestId) && f.featuredOnSite === true
    );

    const cap = args.limit ?? 6;
    const limited = companyFeedback.slice(0, cap);

    return limited.map((f) => {
      const req = requestMap.get(f.clientRequestId);
      // Only expose first name or initial — never full email/phone
      const displayName = f.contactName
        ? f.contactName.split(" ")[0]
        : req?.requesterName
          ? req.requesterName.split(" ")[0]
          : null;

      return {
        id: f._id,
        rating: f.rating,
        comment: f.comment ?? null,
        displayName,
        createdAt: f.createdAt,
      };
    });
  },
});
