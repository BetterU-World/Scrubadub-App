import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalQuery, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireSuperadminSession } from "./lib/sessionAuth";
import {
  companyCard,
  companyReference,
  countJob,
  DAY,
  engagement,
  increment,
  metricCounts,
  PRESENCE_VERSION,
  reportingPlan,
  type Counts,
} from "./lib/adminHubModel";

export const scanTable = v.union(
  v.literal("companies"),
  v.literal("users"),
  v.literal("workerProfiles"),
  v.literal("clientUsers"),
  v.literal("clientRelationships"),
  v.literal("jobs"),
);
const auth = { userId: v.id("users"), sessionToken: v.string() };
const nullableTime = v.union(v.number(), v.null());

async function card(ctx: QueryCtx, company: Doc<"companies">, now: number) {
  const [comp, snapshot, owner, staff, observation, owners] = await Promise.all(
    [
      ctx.db
        .query("complimentarySubscriptions")
        .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
        .unique(),
      company.stripeSubscriptionId
        ? ctx.db
            .query("subscriptionNoticeAccounts")
            .withIndex("by_subscription", (q) =>
              q.eq("snapshot.subscriptionId", company.stripeSubscriptionId!),
            )
            .unique()
        : null,
      ctx.db
        .query("hubCompanyPresence")
        .withIndex("by_company_group_version", (q) =>
          q
            .eq("companyId", company._id)
            .eq("group", "owner")
            .eq("version", PRESENCE_VERSION),
        )
        .unique(),
      ctx.db
        .query("hubCompanyPresence")
        .withIndex("by_company_group_version", (q) =>
          q
            .eq("companyId", company._id)
            .eq("group", "staff")
            .eq("version", PRESENCE_VERSION),
        )
        .unique(),
      ctx.db
        .query("hubObservation")
        .withIndex("by_version", (q) => q.eq("version", PRESENCE_VERSION))
        .unique(),
      ctx.db
        .query("users")
        .withIndex("by_companyId_role", (q) =>
          q.eq("companyId", company._id).eq("role", "owner"),
        )
        .take(3),
    ],
  );
  const start = observation
    ? Math.max(observation.startedAt, company._creationTime)
    : null;
  const s = snapshot?.snapshot;
  return {
    id: company._id,
    measuredAt: now,
    name: company.name,
    contactEmail: company.contactEmail ?? null,
    qa: !!company.qaFixtureKey,
    createdAt: company._creationTime,
    ownerContacts: owners.map((u) => ({ name: u.name, email: u.email })),
    billing: {
      trialEnd: s?.trialEnd ?? null,
      awardedUntil: s?.awardedUntil ?? null,
      plan: reportingPlan(company.tier),
      storedTier: company.tier ?? null,
      status: company.subscriptionStatus ?? "Unknown / unset",
      complimentary: comp?.active === true,
      trial: company.subscriptionStatus === "trialing",
      promotion: s
        ? !!(s.awardedUntil && s.awardedUntil > now) ||
          s.discounts.some((d) => d.start <= now && (!d.end || d.end > now))
        : null,
      cancellation:
        !!company.cancelAtPeriodEnd ||
        !!company.subscriptionCancelAt ||
        company.subscriptionStatus === "canceled",
      snapshotAt: snapshot?.updatedAt ?? null,
      stale: !snapshot || now - snapshot.updatedAt > DAY,
      // Founder notification facts deliberately do not establish universal payment evidence.
      payment: "Unverified" as const,
    },
    ownerLastSeen: owner?.lastSeenAt ?? null,
    staffLastSeen: staff?.lastSeenAt ?? null,
    coverageStart: start,
    engagement7: engagement(
      owner?.lastSeenAt ?? null,
      staff?.lastSeenAt ?? null,
      start,
      now,
      7,
    ),
    engagement30: engagement(
      owner?.lastSeenAt ?? null,
      staff?.lastSeenAt ?? null,
      start,
      now,
      30,
    ),
  };
}

export const companies = query({
  args: {
    ...auth,
    readKey: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
    search: v.string(),
  },
  returns: v.object({
    page: v.array(companyCard),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.sessionToken, args.userId);
    const search = args.search.trim().slice(0, 100);
    const opts = {
      ...args.paginationOpts,
      numItems: Math.min(20, Math.max(1, args.paginationOpts.numItems)),
    };
    const result = search
      ? await ctx.db
          .query("companies")
          .withSearchIndex("search_name", (q) => q.search("name", search))
          .paginate(opts)
      : await ctx.db.query("companies").order("desc").paginate(opts);
    return {
      page: await Promise.all(result.page.map((c) => card(ctx, c, Date.now()))),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

export const company = query({
  args: {
    ...auth,
    companyId: v.id("companies"),
    readKey: v.optional(v.string()),
  },
  returns: v.union(companyCard, v.null()),
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.sessionToken, args.userId);
    const row = await ctx.db.get(args.companyId);
    return row ? card(ctx, row, Date.now()) : null;
  },
});

export const people = query({
  args: {
    ...auth,
    companyId: v.id("companies"),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(
      v.object({
        id: v.id("users"),
        name: v.string(),
        email: v.string(),
        role: v.string(),
        status: v.string(),
      }),
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.sessionToken, args.userId);
    const result = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId!))
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(50, Math.max(1, args.paginationOpts.numItems)),
      });
    return {
      page: result.page.map((u) => ({
        id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status,
      })),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

/** Each page is a separate bounded read transaction. No credentials or full documents leave this query. */
export const scan = internalQuery({
  args: {
    ...auth,
    table: scanTable,
    cursor: v.union(v.string(), v.null()),
    companyId: v.optional(v.id("companies")),
    asOf: v.number(),
  },
  returns: v.object({
    counts: metricCounts,
    companies: v.array(companyReference),
    isDone: v.boolean(),
    cursor: v.string(),
    observationStart: nullableTime,
  }),
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.sessionToken, args.userId);
    const counts: Counts = {},
      opts = {
        cursor: args.cursor,
        numItems: 100,
        maximumBytesRead: 1_000_000,
      };
    const companies: { id: Doc<"companies">["_id"]; name: string }[] = [];
    let isDone = true,
      cursor = "";
    const finish = (result: { isDone: boolean; continueCursor: string }) => {
      isDone = result.isDone;
      cursor = result.continueCursor;
    };
    switch (args.table) {
      case "companies": {
        const selected = args.companyId
          ? await ctx.db.get(args.companyId)
          : null;
        const result = args.companyId
          ? {
              page: selected ? [selected] : [],
              isDone: true,
              continueCursor: "",
            }
          : await ctx.db.query("companies").paginate(opts);
        finish(result);
        for (const c of result.page) {
          companies.push({ id: c._id, name: c.name });
          increment(counts, "companies");
          if (c.qaFixtureKey) increment(counts, "qaCompanies");
          const row = await card(ctx, c, args.asOf);
          increment(counts, `plan:${row.billing.plan}`);
          increment(counts, `subscription:${row.billing.status}`);
          if (row.billing.complimentary) increment(counts, "complimentary");
          if (row.billing.trial) increment(counts, "trial");
          if (row.billing.promotion === true) increment(counts, "promotion");
          if (row.billing.promotion === null)
            increment(counts, "promotionUnknown");
          if (row.billing.cancellation) increment(counts, "cancellation");
          if (row.billing.stale) increment(counts, "staleBilling");
          increment(counts, "paymentUnverified");
          increment(counts, `engagement7:${row.engagement7}`);
          increment(counts, `engagement30:${row.engagement30}`);
        }
        break;
      }
      case "users": {
        const result = args.companyId
          ? await ctx.db
              .query("users")
              .withIndex("by_companyId", (q) =>
                q.eq("companyId", args.companyId!),
              )
              .paginate(opts)
          : await ctx.db.query("users").paginate(opts);
        finish(result);
        for (const u of result.page) {
          increment(counts, "loginAccounts");
          increment(counts, `role:${u.role}`);
          increment(counts, `accountStatus:${u.status}`);
          if (
            u.role === "cleaner" ||
            u.role === "maintenance" ||
            u.role === "manager"
          ) {
            increment(counts, "staffAccounts");
            const profiles = await ctx.db
              .query("workerProfiles")
              .withIndex("by_userId", (q) => q.eq("userId", u._id))
              .take(2);
            if (!profiles.length) increment(counts, "missingWorkerProfiles");
            if (profiles.length > 1)
              increment(counts, "duplicateWorkerProfiles");
            if (profiles.some((p) => p.companyId !== u.companyId))
              increment(counts, "foreignWorkerProfiles");
          }
        }
        break;
      }
      case "workerProfiles": {
        const result = args.companyId
          ? await ctx.db
              .query("workerProfiles")
              .withIndex("by_companyId", (q) =>
                q.eq("companyId", args.companyId!),
              )
              .paginate(opts)
          : await ctx.db.query("workerProfiles").paginate(opts);
        finish(result);
        for (const p of result.page) {
          increment(counts, "workerProfiles");
          increment(counts, `profileStatus:${p.workerStatus}`);
        }
        break;
      }
      case "clientUsers": {
        if (args.companyId) break; // Identity population is global, not summed through relationships.
        const result = await ctx.db.query("clientUsers").paginate(opts);
        finish(result);
        increment(counts, "clientIdentities", result.page.length);
        break;
      }
      case "clientRelationships": {
        const result = args.companyId
          ? await ctx.db
              .query("clientRelationships")
              .withIndex("by_companyId", (q) =>
                q.eq("companyId", args.companyId!),
              )
              .paginate(opts)
          : await ctx.db.query("clientRelationships").paginate(opts);
        finish(result);
        for (const r of result.page) {
          increment(counts, "clientRelationships");
          increment(counts, `relationshipStatus:${r.status}`);
          if (!r.clientUserId) increment(counts, "relationshipsWithoutLogin");
        }
        break;
      }
      case "jobs": {
        const result = args.companyId
          ? await ctx.db
              .query("jobs")
              .withIndex("by_companyId_scheduledDate", (q) =>
                q.eq("companyId", args.companyId!),
              )
              .paginate(opts)
          : await ctx.db.query("jobs").paginate(opts);
        finish(result);
        for (const job of result.page) countJob(counts, job, args.asOf);
        break;
      }
    }
    const observation = await ctx.db
      .query("hubObservation")
      .withIndex("by_version", (q) => q.eq("version", PRESENCE_VERSION))
      .unique();
    return {
      counts,
      companies,
      isDone,
      cursor,
      observationStart: observation?.startedAt ?? null,
    };
  },
});
