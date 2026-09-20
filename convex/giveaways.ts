import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { requireSuperadminSession } from "./lib/sessionAuth";
import { giveawayCampaigns, giveawayState, normalizeGiveawayEmail } from "./lib/giveawayCampaigns";
import { recordGiveawayEntry } from "./lib/giveawayEntries";
import { hashTokenForLookup } from "./lib/tokenHash";
import { checkRateLimit } from "./lib/rateLimit";

function entryName(value: string) {
  const name = value.trim();
  if (!name || name.length > 80 || /[\u0000-\u001f\u007f<>]/.test(name)) throw new Error("Enter a valid first and last name (up to 80 characters each)");
  return name;
}

/** Public write-only AMOE. No account, Assessment, or marketing subscription required. */
export const enterAlternate = mutation({
  args: {
    campaignId: v.string(), browserKey: v.string(), firstName: v.string(), lastName: v.string(), email: v.string(),
    eligibilityConfirmed: v.boolean(), rulesAcknowledged: v.boolean(), marketingConsent: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const campaign = Object.prototype.hasOwnProperty.call(giveawayCampaigns, args.campaignId) ? giveawayCampaigns[args.campaignId] : undefined;
    if (!campaign || giveawayState(campaign, now) !== "active") throw new Error("Giveaway entries are not open");
    if (!/^[a-f0-9]{64}$/i.test(args.browserKey)) throw new Error("Invalid browser key");
    const firstName = entryName(args.firstName);
    const lastName = entryName(args.lastName);
    const normalizedEmail = normalizeGiveawayEmail(args.email);
    const browserHash = await hashTokenForLookup(args.browserKey);
    const emailHash = await hashTokenForLookup(normalizedEmail);
    await checkRateLimit(ctx, { key: `giveaway:alternate:browser:${browserHash}`, limit: 10, windowMs: 60 * 60 * 1000 });
    await checkRateLimit(ctx, { key: `giveaway:alternate:email:${args.campaignId}:${emailHash}`, limit: 10, windowMs: 60 * 60 * 1000 });
    const { outcome, entryId } = await recordGiveawayEntry(ctx, args.campaignId, now, { ...args, marketingConsent: args.marketingConsent ?? false }, { entryMethod: "alternate", firstName, lastName });
    const eventKey = outcome === "qualified" ? "giveaway_alternate_entry_qualified" : "giveaway_duplicate_entry_detected";
    const deduplicationKey = `${entryId}:${eventKey}:alternate:${browserHash}`;
    const event = await ctx.db.query("assessmentEvents").withIndex("by_deduplicationKey", q => q.eq("deduplicationKey", deduplicationKey)).unique();
    if (!event) await ctx.db.insert("assessmentEvents", { eventKey, deduplicationKey, language: "en", metadata: { campaignId: args.campaignId }, createdAt: now });
    // Same receipt for new/duplicate submissions: do not expose whether an email is in the pool.
    return { status: "received" as const };
  },
});

/** Private, paginated export path; no public entrant list or winner-selection endpoint. */
export const entrants = query({
  args: { userId: v.id("users"), sessionToken: v.string(), campaignId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.sessionToken, args.userId);
    const result = await ctx.db.query("giveawayEntries").withIndex("by_campaign_email", q => q.eq("campaignId", args.campaignId)).paginate({ ...args.paginationOpts, numItems: Math.max(1, Math.min(args.paginationOpts.numItems, 250)) });
    return { ...result, page: result.page.map(entry => ({ ...entry, entryMethod: entry.entryMethod ?? "assessment" })) };
  },
});
