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
    if (!site) return [];

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

    // Filter to this company's requests
    const companyFeedback = allFeedback.filter((f) =>
      requestIds.has(f.clientRequestId)
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
