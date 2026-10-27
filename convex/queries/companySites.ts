import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireOwnerSession } from "../lib/sessionAuth";
import { isMiniSitePublished, normalizedAdditionalAreas, validMiniSiteSlug } from "../lib/miniSiteSeo";
import type { Doc } from "../_generated/dataModel";

const DEFAULT_PUBLIC_REVIEW_LIMIT = 6;
const MAX_PUBLIC_REVIEW_LIMIT = 24;

// Match the old by_status_createdAt descending index order, including ties.
function newestFeedbackFirst(a: Doc<"clientFeedback">, b: Doc<"clientFeedback">) {
  return b.createdAt - a.createdAt || b._creationTime - a._creationTime ||
    (a._id === b._id ? 0 : a._id < b._id ? 1 : -1);
}

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
  returns: v.array(v.object({
    id: v.id("clientFeedback"),
    rating: v.number(),
    comment: v.union(v.string(), v.null()),
    displayName: v.union(v.string(), v.null()),
    createdAt: v.number(),
  })),
  handler: async (ctx, args) => {
    const requestedLimit = args.limit ?? DEFAULT_PUBLIC_REVIEW_LIMIT;
    if (!Number.isFinite(requestedLimit)) throw new Error("Review limit must be a finite number");
    const cap = Math.max(0, Math.min(MAX_PUBLIC_REVIEW_LIMIT, Math.floor(requestedLimit)));
    if (cap === 0 || !validMiniSiteSlug(args.slug)) return [];

    const site = await ctx.db
      .query("companySites")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!site || !isMiniSitePublished(site)) return [];
    if (!await ctx.db.get(site.companyId)) return [];

    // Company ownership lives on the request. Check every company request to
    // preserve exact top-N selection; never cap requests before finding reviews.
    // Retain at most N winners and read at most N eligible reviews per request.
    let candidates: Array<{ feedback: Doc<"clientFeedback">; requesterName: string }> = [];
    const requests = ctx.db
      .query("clientRequests")
      .withIndex("by_companyId", (q) => q.eq("companyId", site.companyId));
    for await (const request of requests) {
      const oldestWinner = candidates.length === cap ? candidates[cap - 1].feedback.createdAt : undefined;
      const feedback = await ctx.db
        .query("clientFeedback")
        .withIndex("by_clientRequestId_status_featuredOnSite_createdAt", (q) => {
          const range = q.eq("clientRequestId", request._id).eq("status", "reviewed").eq("featuredOnSite", true);
          // Keep timestamp ties for the global creation-time/ID tie breakers.
          return oldestWinner === undefined ? range : range.gte("createdAt", oldestWinner);
        })
        .order("desc")
        .take(cap);
      candidates.push(...feedback.map((entry) => ({ feedback: entry, requesterName: request.requesterName })));
      candidates.sort((a, b) => newestFeedbackFirst(a.feedback, b.feedback));
      candidates = candidates.slice(0, cap);
    }

    return candidates.map(({ feedback: f, requesterName }) => {
      // Only expose first name or initial — never full email/phone
      const displayName = f.contactName
        ? f.contactName.split(" ")[0]
        : requesterName
          ? requesterName.split(" ")[0]
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
