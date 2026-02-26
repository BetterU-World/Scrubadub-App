import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../lib/helpers";

/**
 * Public query – returns minimal branding info for a company given its
 * publicRequestToken.  No auth required.  Returns null for invalid tokens
 * so the UI can show an error state without leaking data.
 */
export const getCompanyByRequestToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const company = await ctx.db
      .query("companies")
      .withIndex("by_publicRequestToken", (q) =>
        q.eq("publicRequestToken", args.token)
      )
      .first();

    if (!company) return null;

    return { companyName: company.name };
  },
});

/**
 * List all client requests for a company.
 * Requires authenticated user who belongs to the company.
 */
export const getCompanyRequests = query({
  args: {
    companyId: v.id("companies"),
    userId: v.optional(v.id("users")),
    status: v.optional(
      v.union(
        v.literal("new"),
        v.literal("accepted"),
        v.literal("declined"),
        v.literal("converted"),
        v.literal("contacted"),
        v.literal("archived")
      )
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.userId);
    if (user.companyId !== args.companyId) {
      throw new Error("Access denied");
    }

    if (args.status) {
      return await ctx.db
        .query("clientRequests")
        .withIndex("by_companyId_status", (q) =>
          q.eq("companyId", args.companyId).eq("status", args.status!)
        )
        .collect();
    }

    return await ctx.db
      .query("clientRequests")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
  },
});

/**
 * Get a single client request by ID.
 * Requires authenticated user who belongs to the request's company.
 */
export const getRequestById = query({
  args: {
    id: v.id("clientRequests"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.userId);

    const request = await ctx.db.get(args.id);
    if (!request) return null;

    if (request.companyId !== user.companyId) {
      throw new Error("Access denied");
    }

    return request;
  },
});

// ── Lead Pipeline queries ─────────────────────────────────────

/**
 * List requests for the pipeline board.
 * Owner-only; company-scoped. Treats missing leadStage as "new".
 * Returns newest-first.
 */
export const listRequestsForPipeline = query({
  args: {
    userId: v.id("users"),
    leadStage: v.optional(
      v.union(
        v.literal("new"),
        v.literal("contacted"),
        v.literal("quoted"),
        v.literal("won"),
        v.literal("lost")
      )
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.userId);
    if (user.role !== "owner") throw new Error("Owner access required");

    const requests = await ctx.db
      .query("clientRequests")
      .withIndex("by_companyId", (q) => q.eq("companyId", user.companyId))
      .collect();

    // Treat missing leadStage as "new"
    const enriched = requests.map((r) => ({
      ...r,
      leadStage: (r as any).leadStage ?? "new",
    }));

    const filtered = args.leadStage
      ? enriched.filter((r) => r.leadStage === args.leadStage)
      : enriched;

    return filtered.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/**
 * List upcoming follow-ups for the owner.
 * Returns requests with nextFollowUpAt set, not in terminal stages (won/lost/archived).
 * dueOnly=true returns only overdue/today items.
 */
export const listFollowUps = query({
  args: {
    userId: v.id("users"),
    dueOnly: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.userId);
    if (user.role !== "owner") throw new Error("Owner access required");

    const requests = await ctx.db
      .query("clientRequests")
      .withIndex("by_companyId", (q) => q.eq("companyId", user.companyId))
      .collect();

    const withFollowUp = requests.filter((r) => {
      if (!(r as any).nextFollowUpAt) return false;
      // Exclude terminal stages
      const stage = (r as any).leadStage ?? "new";
      if (stage === "won" || stage === "lost") return false;
      if (r.status === "archived") return false;
      return true;
    });

    let results = withFollowUp;
    if (args.dueOnly) {
      const now = Date.now();
      results = withFollowUp.filter((r) => (r as any).nextFollowUpAt <= now);
    }

    // Sort soonest first
    results.sort(
      (a, b) => ((a as any).nextFollowUpAt ?? 0) - ((b as any).nextFollowUpAt ?? 0)
    );

    if (args.limit) {
      results = results.slice(0, args.limit);
    }

    return results;
  },
});

// ── Client Portal queries ─────────────────────────────────────

/**
 * Public query – returns safe fields for a client portal given a portalToken.
 * No auth required; token scopes access.  Returns null for invalid/disabled.
 */
export const getClientPortalByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("clientRequests")
      .withIndex("by_portalToken", (q) => q.eq("portalToken", args.token))
      .first();

    if (!request || !request.portalEnabled) return null;

    // Fetch company branding from companySites (optional)
    const site = await ctx.db
      .query("companySites")
      .withIndex("by_companyId", (q) => q.eq("companyId", request.companyId))
      .first();

    const company = await ctx.db.get(request.companyId);

    return {
      requestId: request._id,
      requesterName: request.requesterName,
      propertyName: request.propertySnapshot?.name ?? null,
      propertyAddress: request.propertySnapshot?.address ?? null,
      requestedDate: request.requestedDate ?? null,
      timeWindow: request.timeWindow ?? null,
      status: request.status,
      clientNotes: request.clientNotes ?? "",
      notes: request.notes ?? null,
      // Company branding
      companyName: site?.brandName ?? company?.name ?? "Your Cleaning Company",
      companyLogoUrl: site?.logoUrl ?? null,
      companyPhone: site?.publicPhone ?? null,
      companyEmail: site?.publicEmail ?? null,
    };
  },
});

/**
 * List client feedback for the caller's company.
 * Owner-only, scoped to company's clientRequests.
 */
export const listClientFeedback = query({
  args: {
    userId: v.id("users"),
    status: v.optional(v.union(v.literal("new"), v.literal("reviewed"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.userId);
    if (user.role !== "owner") throw new Error("Owner access required");

    // Get all company requests
    const requests = await ctx.db
      .query("clientRequests")
      .withIndex("by_companyId", (q) => q.eq("companyId", user.companyId))
      .collect();

    const requestIds = new Set(requests.map((r) => r._id));
    const requestMap = new Map(requests.map((r) => [r._id, r]));

    // Get feedback, optionally filtered by status
    let feedbackQuery = ctx.db.query("clientFeedback");
    if (args.status) {
      feedbackQuery = feedbackQuery.withIndex("by_status_createdAt", (q) =>
        q.eq("status", args.status!)
      );
    }

    const allFeedback = await feedbackQuery.order("desc").collect();

    // Filter to only this company's requests
    const companyFeedback = allFeedback.filter((f) =>
      requestIds.has(f.clientRequestId)
    );

    const limited = args.limit
      ? companyFeedback.slice(0, args.limit)
      : companyFeedback;

    return limited.map((f) => {
      const req = requestMap.get(f.clientRequestId);
      return {
        ...f,
        requesterName: req?.requesterName ?? "Unknown",
        requesterEmail: req?.requesterEmail ?? "",
        requestSummary: req
          ? [req.propertySnapshot?.address, req.requestedDate]
              .filter(Boolean)
              .join(" — ") || "Request"
          : "Unknown request",
      };
    });
  },
});

/**
 * Get the latest feedback for a specific client request.
 * Owner-only, scoped to caller's company.
 */
export const getLatestFeedbackForRequest = query({
  args: {
    userId: v.id("users"),
    clientRequestId: v.id("clientRequests"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.userId);
    if (user.role !== "owner") throw new Error("Owner access required");

    const request = await ctx.db.get(args.clientRequestId);
    if (!request) return null;
    if (request.companyId !== user.companyId) throw new Error("Access denied");

    const feedback = await ctx.db
      .query("clientFeedback")
      .withIndex("by_clientRequestId_createdAt", (q) =>
        q.eq("clientRequestId", args.clientRequestId)
      )
      .order("desc")
      .first();

    return feedback;
  },
});
