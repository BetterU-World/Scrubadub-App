import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireOwner, requireAuth } from "../lib/helpers";

/**
 * Public mutation – called by external visitors via a company's public
 * booking-request link.  No authentication required; the company is
 * resolved server-side from the token.  companyId is NEVER accepted
 * from the client.
 */
export const createClientRequestByToken = mutation({
  args: {
    token: v.string(),
    requesterName: v.string(),
    requesterEmail: v.string(),
    requesterPhone: v.optional(v.string()),
    propertySnapshot: v.optional(
      v.object({
        name: v.optional(v.string()),
        address: v.optional(v.string()),
        notes: v.optional(v.string()),
      })
    ),
    requestedDate: v.optional(v.string()),
    requestedStart: v.optional(v.string()),
    requestedEnd: v.optional(v.string()),
    timeWindow: v.optional(v.string()),
    notes: v.optional(v.string()),
    clientNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Resolve company from token – never trust a client-supplied companyId
    const company = await ctx.db
      .query("companies")
      .withIndex("by_publicRequestToken", (q) =>
        q.eq("publicRequestToken", args.token)
      )
      .first();

    if (!company) {
      throw new Error("Invalid request link");
    }

    const requestId = await ctx.db.insert("clientRequests", {
      companyId: company._id,
      createdAt: Date.now(),
      status: "new",
      requesterName: args.requesterName,
      requesterEmail: args.requesterEmail,
      requesterPhone: args.requesterPhone,
      propertySnapshot: args.propertySnapshot ?? {},
      requestedDate: args.requestedDate,
      requestedStart: args.requestedStart,
      requestedEnd: args.requestedEnd,
      timeWindow: args.timeWindow,
      notes: args.notes,
      clientNotes: args.clientNotes
        ? args.clientNotes.trim().slice(0, 2000)
        : undefined,
      source: "public_link",
    });

    // Notify all active owners in this company
    const owners = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
      .collect();

    const activeOwners = owners.filter(
      (u) => u.role === "owner" && u.status === "active"
    );

    for (const owner of activeOwners) {
      await ctx.db.insert("notifications", {
        companyId: company._id,
        userId: owner._id,
        type: "new_client_request",
        title: "New booking request",
        message: `${args.requesterName} submitted a new service request.`,
        read: false,
        relatedClientRequestId: requestId,
      });
    }

    return requestId;
  },
});

/**
 * Update the status of a client request.
 * Auth-gated: caller must be an owner in the same company as the request.
 */
export const updateRequestStatus = mutation({
  args: {
    requestId: v.id("clientRequests"),
    userId: v.optional(v.id("users")),
    status: v.union(
      v.literal("declined"),
      v.literal("converted"),
      v.literal("contacted")
    ),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error("Request not found");
    }
    if (request.companyId !== owner.companyId) {
      throw new Error("Access denied");
    }

    const patch: Record<string, unknown> = { status: args.status };
    if (args.status === "contacted") {
      patch.contactedAt = Date.now();
    }

    await ctx.db.patch(args.requestId, patch);
  },
});

/**
 * Archive a client request.
 * Owner-only; scoped to caller's company.
 */
export const archiveClientRequest = mutation({
  args: {
    requestId: v.id("clientRequests"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    if (request.companyId !== owner.companyId) throw new Error("Access denied");

    await ctx.db.patch(args.requestId, {
      status: "archived",
      archivedAt: Date.now(),
    });
  },
});

/**
 * Create a property from a client request's propertySnapshot.
 * Auth-gated: caller must be an owner in the same company as the request.
 * No-op if the request already has a propertyId.
 */
export const createPropertyFromRequest = mutation({
  args: {
    requestId: v.id("clientRequests"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    if (request.companyId !== owner.companyId) throw new Error("Access denied");

    // No-op if already linked
    if (request.propertyId) return request.propertyId;

    const snap = request.propertySnapshot ?? {};
    const address = snap.address || "Address pending";

    const propertyId = await ctx.db.insert("properties", {
      companyId: request.companyId,
      name: snap.name || address,
      type: "residential" as const,
      address,
      amenities: [],
      active: true,
      ownerNotes: snap.notes || undefined,
    });

    await ctx.db.patch(args.requestId, { propertyId });

    return propertyId;
  },
});

// ── Lead Pipeline mutations ─────────────────────────────────────

const LEAD_STAGES = ["new", "contacted", "quoted", "won", "lost"] as const;

/**
 * Update the CRM lead stage for a request.
 * Owner-only; scoped to company.
 */
export const updateLeadStage = mutation({
  args: {
    userId: v.id("users"),
    requestId: v.id("clientRequests"),
    leadStage: v.union(
      v.literal("new"),
      v.literal("contacted"),
      v.literal("quoted"),
      v.literal("won"),
      v.literal("lost")
    ),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    if (request.companyId !== owner.companyId) throw new Error("Access denied");

    const patch: Record<string, unknown> = {
      leadStage: args.leadStage,
      lastStageChangedAt: Date.now(),
    };

    // Sync contactedAt when moving to contacted stage
    if (args.leadStage === "contacted" && !request.contactedAt) {
      patch.contactedAt = Date.now();
    }

    await ctx.db.patch(args.requestId, patch);
  },
});

/**
 * Update internal lead notes for a request.
 * Owner-only; scoped to company. Capped at 4000 chars.
 */
export const updateLeadNotes = mutation({
  args: {
    userId: v.id("users"),
    requestId: v.id("clientRequests"),
    leadNotes: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    if (request.companyId !== owner.companyId) throw new Error("Access denied");

    await ctx.db.patch(args.requestId, {
      leadNotes: args.leadNotes.trim().slice(0, 4000) || undefined,
    });
  },
});

/**
 * Update or clear next follow-up date for a request.
 * Owner-only; scoped to company.
 */
export const updateNextFollowUp = mutation({
  args: {
    userId: v.id("users"),
    requestId: v.id("clientRequests"),
    nextFollowUpAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    if (request.companyId !== owner.companyId) throw new Error("Access denied");

    await ctx.db.patch(args.requestId, {
      nextFollowUpAt: args.nextFollowUpAt ?? undefined,
    });
  },
});

// ── Client Portal mutations ─────────────────────────────────────

function generateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 40; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

/**
 * Generate (or return existing) portal link for a client request.
 * Owner-only.
 */
export const generateClientPortalLink = mutation({
  args: {
    userId: v.id("users"),
    clientRequestId: v.id("clientRequests"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);

    const request = await ctx.db.get(args.clientRequestId);
    if (!request) throw new Error("Request not found");
    if (request.companyId !== owner.companyId) throw new Error("Access denied");

    if (request.portalToken && request.portalEnabled) {
      return { token: request.portalToken };
    }

    // Generate unique token
    let token: string;
    for (let attempt = 0; attempt < 10; attempt++) {
      token = generateToken();
      const existing = await ctx.db
        .query("clientRequests")
        .withIndex("by_portalToken", (q) => q.eq("portalToken", token))
        .first();
      if (!existing) {
        await ctx.db.patch(args.clientRequestId, {
          portalToken: token,
          portalEnabled: true,
        });
        return { token };
      }
    }

    throw new Error("Failed to generate unique token. Please try again.");
  },
});

/**
 * Public mutation: update client notes via portal token.
 * No auth required — token scopes access.
 */
export const updateClientNotesByToken = mutation({
  args: {
    token: v.string(),
    clientNotes: v.string(),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("clientRequests")
      .withIndex("by_portalToken", (q) => q.eq("portalToken", args.token))
      .first();

    if (!request || !request.portalEnabled) {
      throw new Error("Invalid or expired link");
    }

    await ctx.db.patch(request._id, {
      clientNotes: args.clientNotes.trim().slice(0, 2000),
      updatedByClientAt: Date.now(),
    });

    return { ok: true };
  },
});

/**
 * Public mutation: submit feedback via portal token.
 * No auth required — token scopes access.
 */
export const submitClientFeedbackByToken = mutation({
  args: {
    token: v.string(),
    rating: v.number(),
    comment: v.optional(v.string()),
    contactName: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("clientRequests")
      .withIndex("by_portalToken", (q) => q.eq("portalToken", args.token))
      .first();

    if (!request || !request.portalEnabled) {
      throw new Error("Invalid or expired link");
    }

    if (args.rating < 1 || args.rating > 5 || !Number.isInteger(args.rating)) {
      throw new Error("Rating must be an integer from 1 to 5");
    }

    await ctx.db.insert("clientFeedback", {
      clientRequestId: request._id,
      createdAt: Date.now(),
      rating: args.rating,
      comment: args.comment ? args.comment.trim().slice(0, 1000) : undefined,
      contactName: args.contactName
        ? args.contactName.trim().slice(0, 200)
        : undefined,
      contactEmail: args.contactEmail
        ? args.contactEmail.trim().slice(0, 200)
        : undefined,
      status: "new",
    });

    return { ok: true };
  },
});

/**
 * Mark a feedback entry as reviewed.
 * Owner-only; verifies feedback belongs to caller's company.
 */
export const markFeedbackReviewed = mutation({
  args: {
    userId: v.id("users"),
    feedbackId: v.id("clientFeedback"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.userId);
    if (user.role !== "owner") throw new Error("Owner access required");

    const feedback = await ctx.db.get(args.feedbackId);
    if (!feedback) throw new Error("Feedback not found");

    // Verify ownership via the linked request
    const request = await ctx.db.get(feedback.clientRequestId);
    if (!request || request.companyId !== user.companyId) {
      throw new Error("Access denied");
    }

    await ctx.db.patch(args.feedbackId, { status: "reviewed" });
    return { ok: true };
  },
});
