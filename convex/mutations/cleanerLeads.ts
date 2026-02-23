import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireOwner } from "../lib/helpers";

/**
 * Public mutation – called by external visitors via a company's mini-site
 * cleaner application page.  No authentication required; the company is
 * resolved server-side from the slug.  companyId is NEVER accepted from
 * the client.
 */
export const createCleanerLeadBySlug = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    city: v.optional(v.string()),
    hasCar: v.optional(v.boolean()),
    experience: v.optional(v.string()),
    availability: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const normalizedSlug = args.slug.trim().toLowerCase();

    // Resolve company from slug via companySites
    const site = await ctx.db
      .query("companySites")
      .withIndex("by_slug", (q) => q.eq("slug", normalizedSlug))
      .first();

    if (!site) {
      throw new Error("Invalid application link");
    }

    await ctx.db.insert("cleanerLeads", {
      companyId: site.companyId,
      createdAt: Date.now(),
      status: "new",
      name: args.name.trim(),
      email: args.email.trim().toLowerCase(),
      phone: args.phone?.trim() || undefined,
      city: args.city?.trim() || undefined,
      hasCar: args.hasCar,
      experience: args.experience?.trim() || undefined,
      availability: args.availability?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
    });

    return { ok: true };
  },
});

/**
 * Update the status of a cleaner lead.
 * Auth-gated: caller must be an owner in the same company as the lead.
 */
export const updateCleanerLeadStatus = mutation({
  args: {
    leadId: v.id("cleanerLeads"),
    userId: v.optional(v.id("users")),
    status: v.union(
      v.literal("reviewed"),
      v.literal("contacted"),
      v.literal("archived")
    ),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);

    const lead = await ctx.db.get(args.leadId);
    if (!lead) {
      throw new Error("Lead not found");
    }
    if (lead.companyId !== owner.companyId) {
      throw new Error("Access denied");
    }

    await ctx.db.patch(args.leadId, { status: args.status });
  },
});
