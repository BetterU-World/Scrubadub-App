import { internalMutation, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireReadOnlyStaffSession } from "./lib/sessionAuth";
import { DAY, PRESENCE_THROTTLE, PRESENCE_VERSION } from "./lib/adminHubModel";

/** Called only by the foreground application boundary; no URL or client identity is persisted. */
export const observe = mutation({
  args: { sessionToken: v.string(), surface: v.literal("staff_app") },
  returns: v.object({ recorded: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireReadOnlyStaffSession(ctx, args.sessionToken);
    if (!user.companyId || user.role === "affiliate")
      return { recorded: false };
    if (!(await ctx.db.get(user.companyId))) return { recorded: false };
    const now = Date.now(),
      day = new Date(now).toISOString().slice(0, 10);
    const row = await ctx.db
      .query("hubDailyPresence")
      .withIndex("by_company_user_role_day_version", (q) =>
        q
          .eq("companyId", user.companyId!)
          .eq("userId", user._id)
          .eq(
            "role",
            user.role as "owner" | "manager" | "cleaner" | "maintenance",
          )
          .eq("day", day)
          .eq("version", PRESENCE_VERSION),
      )
      .unique();
    if (row && now - row.lastSeenAt < PRESENCE_THROTTLE)
      return { recorded: false };
    const observation = await ctx.db
      .query("hubObservation")
      .withIndex("by_version", (q) => q.eq("version", PRESENCE_VERSION))
      .unique();
    if (!observation)
      await ctx.db.insert("hubObservation", {
        version: PRESENCE_VERSION,
        startedAt: now,
      });
    if (row) await ctx.db.patch(row._id, { lastSeenAt: now });
    else
      await ctx.db.insert("hubDailyPresence", {
        companyId: user.companyId,
        userId: user._id,
        role: user.role,
        day,
        version: PRESENCE_VERSION,
        firstSeenAt: now,
        lastSeenAt: now,
        expiresAt: Date.parse(`${day}T00:00:00Z`) + 46 * DAY,
      });
    const group = user.role === "owner" ? "owner" : "staff";
    const company = await ctx.db
      .query("hubCompanyPresence")
      .withIndex("by_company_group_version", (q) =>
        q
          .eq("companyId", user.companyId!)
          .eq("group", group)
          .eq("version", PRESENCE_VERSION),
      )
      .unique();
    if (company) await ctx.db.patch(company._id, { lastSeenAt: now });
    else
      await ctx.db.insert("hubCompanyPresence", {
        companyId: user.companyId,
        group,
        version: PRESENCE_VERSION,
        lastSeenAt: now,
      });
    return { recorded: true };
  },
});

/** Bounded retention: daily identities <=46 days, company group last-seen <=90 days. */
export const prune = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const daily = await ctx.db
      .query("hubDailyPresence")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .take(250);
    const companies = await ctx.db
      .query("hubCompanyPresence")
      .withIndex("by_lastSeenAt", (q) => q.lt("lastSeenAt", now - 90 * DAY))
      .take(250);
    for (const row of [...daily, ...companies]) await ctx.db.delete(row._id);
    // Drain a backlog in separate transactions instead of accumulating expired identities at scale.
    if (daily.length === 250 || companies.length === 250) {
      await ctx.scheduler.runAfter(100, internal.adminPresence.prune, {});
    }
    return null;
  },
});
