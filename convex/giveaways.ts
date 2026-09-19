import { query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { requireSuperadminSession } from "./lib/sessionAuth";

/** Private, paginated export path; no public entrant list or winner-selection endpoint. */
export const entrants = query({
  args: { userId: v.id("users"), sessionToken: v.string(), campaignId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.sessionToken, args.userId);
    return ctx.db.query("giveawayEntries").withIndex("by_campaign_email", q => q.eq("campaignId", args.campaignId)).paginate({ ...args.paginationOpts, numItems: Math.max(1, Math.min(args.paginationOpts.numItems, 250)) });
  },
});
