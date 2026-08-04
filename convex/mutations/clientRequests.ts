import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireOwnerManagerSession, requireOwnerSession, requireVerifiedClientSession, requireActiveClientRelationship } from "../lib/sessionAuth";
import { checkRateLimit } from "../lib/rateLimit";
import { propertyTypeFromRequestLeadType } from "../lib/commercialEligibility";
import { createRequestedAddOnSnapshots } from "../lib/companyAddOnSelection";
import { AUTHENTICATED_REQUEST_SERVICES, AUTHENTICATED_REQUEST_TIME_WINDOWS } from "../lib/clientRequestPortal";
import { isExistingClientServiceRequest } from "../lib/requestContext";
import { logAudit } from "../lib/helpers";

const authenticatedLocationValidator = v.union(
  v.object({ type: v.literal("property"), id: v.id("properties") }),
  v.object({ type: v.literal("commercial_account"), id: v.id("commercialAccounts") })
);

function dateInTimeZone(timeZone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export const createAuthenticatedClientRequest = mutation({
  args: {
    clientUserId: v.id("clientUsers"),
    sessionToken: v.string(),
    clientRelationshipId: v.id("clientRelationships"),
    location: authenticatedLocationValidator,
    requestedService: v.string(),
    requestedDate: v.string(),
    timeWindow: v.string(),
    notes: v.optional(v.string()),
    requestedAddOns: v.optional(v.array(v.object({
      companyAddOnId: v.id("companyAddOns"),
      selectionVersion: v.string(),
      quantity: v.optional(v.number()),
    }))),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const clientUser = await requireVerifiedClientSession(ctx, args.sessionToken, args.clientUserId);
    const relationship = await requireActiveClientRelationship(ctx, clientUser, args.clientRelationshipId);
    const company = await ctx.db.get(relationship.companyId);
    if (!company) throw new Error("Cleaning company is unavailable");
    const key = args.idempotencyKey.trim();
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new Error("Invalid submission key");

    const existing = await ctx.db
      .query("clientRequests")
      .withIndex("by_originClientUserId_idempotencyKey", (q) => q.eq("originClientUserId", clientUser._id).eq("idempotencyKey", key))
      .unique();
    if (existing) return { requestId: existing._id, replayed: true };

    await checkRateLimit(ctx, { key: `client:${clientUser._id}:createAuthenticatedRequest`, limit: 5, windowMs: 600_000 });
    if (!AUTHENTICATED_REQUEST_SERVICES.includes(args.requestedService as any)) throw new Error("Select a supported service");
    if (!AUTHENTICATED_REQUEST_TIME_WINDOWS.includes(args.timeWindow as any)) throw new Error("Select a supported time window");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.requestedDate) || Number.isNaN(Date.parse(`${args.requestedDate}T00:00:00Z`))) throw new Error("Enter a valid preferred date");
    if (args.requestedDate < dateInTimeZone(company.timezone || "UTC")) throw new Error("Preferred date cannot be in the past");
    const maxDate = new Date(); maxDate.setUTCFullYear(maxDate.getUTCFullYear() + 2);
    if (args.requestedDate > maxDate.toISOString().slice(0, 10)) throw new Error("Preferred date is too far in the future");
    const notes = args.notes?.trim();
    if (notes && notes.length > 2000) throw new Error("Notes must be 2,000 characters or fewer");

    let propertyId: any;
    let commercialAccountId: any;
    let propertySnapshot: { name?: string; address?: string };
    if (args.location.type === "property") {
      const property = await ctx.db.get(args.location.id);
      if (!property || property.companyId !== relationship.companyId || property.clientRelationshipId !== relationship._id || !property.active) throw new Error("Selected location is unavailable");
      propertyId = property._id;
      propertySnapshot = { name: property.name, address: property.address };
    } else {
      const account = await ctx.db.get(args.location.id);
      if (!account || account.companyId !== relationship.companyId || account.clientRelationshipId !== relationship._id || account.status !== "active") throw new Error("Selected location is unavailable");
      commercialAccountId = account._id;
      propertySnapshot = { name: account.clientName, address: account.serviceAddress };
    }

    const requestedAddOnSnapshots = await createRequestedAddOnSnapshots(ctx, relationship.companyId, args.requestedAddOns ?? []);
    const requestId = await ctx.db.insert("clientRequests", {
      companyId: relationship.companyId,
      clientRelationshipId: relationship._id,
      originClientUserId: clientUser._id,
      idempotencyKey: key,
      createdAt: Date.now(),
      status: "new",
      leadStage: "new",
      requesterName: relationship.primaryContactName || relationship.displayName || clientUser.displayName,
      requesterEmail: clientUser.email,
      requesterPhone: clientUser.phone,
      propertySnapshot,
      propertyId,
      commercialAccountId,
      requestedDate: args.requestedDate,
      timeWindow: args.timeWindow,
      requestedService: args.requestedService,
      requestedAddOnSnapshots: requestedAddOnSnapshots.length ? requestedAddOnSnapshots : undefined,
      notes: notes || undefined,
      source: "authenticated_client",
      leadType: "booking_request",
    });

    const users = await ctx.db.query("users").withIndex("by_companyId", (q) => q.eq("companyId", relationship.companyId)).collect();
    for (const owner of users.filter((user) => user.role === "owner" && user.status === "active")) {
      await ctx.db.insert("notifications", {
        companyId: relationship.companyId,
        userId: owner._id,
        type: "new_client_request",
        title: "New authenticated client request",
        message: `${clientUser.displayName} requested ${args.requestedService} at ${propertySnapshot.name || "a service location"}.`,
        read: false,
        relatedClientRequestId: requestId,
      });
    }
    return { requestId, replayed: false };
  },
});

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
    requestedService: v.optional(v.string()),
    requestedAddOns: v.optional(v.array(v.object({
      companyAddOnId: v.id("companyAddOns"),
      selectionVersion: v.string(),
      quantity: v.optional(v.number()),
    }))),
    clientNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Rate limit: 3 public form submissions per 10 min per token/email
    await checkRateLimit(ctx, {
      key: `t:${args.token}:createClientRequest`,
      limit: 3,
      windowMs: 600_000,
    });
    await checkRateLimit(ctx, {
      key: `e:${args.requesterEmail.trim().toLowerCase()}:createClientRequest`,
      limit: 3,
      windowMs: 600_000,
    });

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

    const requestedAddOnSnapshots = await createRequestedAddOnSnapshots(
      ctx,
      company._id,
      args.requestedAddOns ?? []
    );

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
      requestedService: args.requestedService || undefined,
      requestedAddOnSnapshots: requestedAddOnSnapshots.length ? requestedAddOnSnapshots : undefined,
      leadType: "booking_request",
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
    sessionToken: v.string(),
    status: v.union(
      v.literal("declined"),
      v.literal("converted"),
      v.literal("contacted")
    ),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);

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
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    if (request.companyId !== owner.companyId) throw new Error("Access denied");

    await ctx.db.patch(args.requestId, {
      status: "archived",
      archivedAt: Date.now(),
    });
  },
});

export const declineJobRequest = mutation({
  args: { requestId: v.id("clientRequests"), userId: v.optional(v.id("users")), sessionToken: v.string(), clientFacingDecisionNote: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireOwnerManagerSession(ctx, args.sessionToken, args.userId);
    if (actor.role === "manager" && actor.canManageSchedule !== true) throw new Error("Schedule management permission required");
    const request = await ctx.db.get(args.requestId);
    if (!request || request.companyId !== actor.companyId) throw new Error("Access denied");
    if (!(await isExistingClientServiceRequest(ctx, request))) throw new Error("Request is not an existing-client job request");
    const existingJob = await ctx.db.query("jobs").withIndex("by_sourceClientRequestId", q => q.eq("sourceClientRequestId", request._id)).first();
    if (existingJob) throw new Error("A linked job already exists");
    if (request.status === "declined") return { declinedAt: request.declinedAt, replayed: true };
    if (request.status === "archived") throw new Error("Archived requests cannot be declined");
    const note = args.clientFacingDecisionNote?.trim();
    if (note && note.length > 500) throw new Error("Client-facing explanation must be 500 characters or fewer");
    const declinedAt = Date.now();
    await ctx.db.patch(request._id, { status: "declined", leadStage: "declined", lastStageChangedAt: declinedAt, declinedAt, declinedByUserId: actor._id, clientFacingDecisionNote: note || undefined });
    await logAudit(ctx, { companyId: actor.companyId, userId: actor._id, action: "decline_client_job_request", entityType: "clientRequest", entityId: request._id, details: JSON.stringify({ clientFacingDecisionNoteSupplied: Boolean(note) }) });
    return { declinedAt, replayed: false };
  },
});

/**
 * Create a property from a client request's propertySnapshot.
 * Auth-gated: caller must be an owner or manager in the same company as the request.
 * No-op if the request already has a propertyId.
 */
export const createPropertyFromRequest = mutation({
  args: {
    requestId: v.id("clientRequests"),
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerManagerSession(ctx, args.sessionToken, args.userId);

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    if (request.companyId !== owner.companyId) throw new Error("Access denied");

    // No-op if already linked
    if (request.propertyId) {
      return { propertyId: request.propertyId, created: false };
    }

    const snap = request.propertySnapshot ?? {};
    const address = snap.address?.trim();
    if (!address) {
      throw new Error("A valid property address is required");
    }
    const propertyType = propertyTypeFromRequestLeadType(request.leadType);
    if (!propertyType) {
      throw new Error(
        "Classify this request as Residential, Commercial, or STR before creating a property"
      );
    }

    if (request.clientRelationshipId) {
      const relationship = await ctx.db.get(request.clientRelationshipId);
      if (!relationship || relationship.companyId !== request.companyId) {
        throw new Error("Client relationship must belong to the request company");
      }
    }

    const propertyId = await ctx.db.insert("properties", {
      companyId: request.companyId,
      clientRelationshipId: request.clientRelationshipId,
      name: snap.name?.trim() || address,
      type: propertyType,
      address,
      amenities: [],
      active: true,
      ownerNotes: snap.notes || undefined,
    });

    await ctx.db.patch(args.requestId, { propertyId });

    return { propertyId, created: true };
  },
});

// ── Lead Pipeline mutations ─────────────────────────────────────

const leadStageValidator = v.union(
  v.literal("new"),
  v.literal("contacted"),
  v.literal("walkthrough_scheduled"),
  v.literal("proposal_needed"),
  v.literal("proposal_sent"),
  v.literal("negotiating"),
  v.literal("accepted"),
  v.literal("declined"),
  v.literal("converted"),
  v.literal("quoted"),
  v.literal("won"),
  v.literal("lost")
);

const leadTypeValidator = v.union(
  v.literal("booking_request"),
  v.literal("residential"),
  v.literal("str_airbnb"),
  v.literal("commercial"),
  v.literal("move_out"),
  v.literal("post_construction"),
  v.literal("other")
);

const estimatedFrequencyValidator = v.union(
  v.literal("one_time"),
  v.literal("weekly"),
  v.literal("biweekly"),
  v.literal("monthly"),
  v.literal("quarterly"),
  v.literal("custom")
);

function cleanOptional(value: string | undefined, max = 500) {
  const trimmed = value?.trim().slice(0, max);
  return trimmed || undefined;
}

function patchForStage(leadStage: string, request: any) {
  const now = Date.now();
  const patch: Record<string, unknown> = {
    leadStage,
    lastStageChangedAt: now,
  };

  if (leadStage === "contacted" && !request.contactedAt) {
    patch.contactedAt = now;
    patch.status = "contacted";
  }
  if ((leadStage === "declined" || leadStage === "lost") && request.status !== "converted") {
    patch.status = "declined";
  }
  if (leadStage === "converted" && request.status !== "converted") {
    patch.status = "converted";
  }

  return patch;
}

/**
 * Create a manual lead/request from the owner Leads area.
 * Owner-only; company is derived from the authenticated owner.
 */
export const createManualClientRequest = mutation({
  args: {
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
    requesterName: v.string(),
    requesterEmail: v.string(),
    requesterPhone: v.optional(v.string()),
    propertyName: v.optional(v.string()),
    propertyAddress: v.optional(v.string()),
    notes: v.optional(v.string()),
    requestedService: v.optional(v.string()),
    leadType: v.optional(leadTypeValidator),
    leadStage: v.optional(leadStageValidator),
    businessName: v.optional(v.string()),
    businessContactTitle: v.optional(v.string()),
    businessWebsite: v.optional(v.string()),
    estimatedContractValueCents: v.optional(v.number()),
    estimatedFrequency: v.optional(estimatedFrequencyValidator),
    estimatedFrequencyNotes: v.optional(v.string()),
    clientRelationshipId: v.optional(v.id("clientRelationships")),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    const now = Date.now();
    const relationship = args.clientRelationshipId
      ? await ctx.db.get(args.clientRelationshipId)
      : null;
    if (relationship && relationship.companyId !== owner.companyId) {
      throw new Error("Client relationship must belong to your company");
    }

    const requestId = await ctx.db.insert("clientRequests", {
      companyId: owner.companyId!,
      clientRelationshipId: relationship?._id,
      createdAt: now,
      status: args.leadStage === "contacted" ? "contacted" : "new",
      contactedAt: args.leadStage === "contacted" ? now : undefined,
      requesterName: args.requesterName.trim().slice(0, 200),
      requesterEmail: args.requesterEmail.trim().toLowerCase().slice(0, 200),
      requesterPhone: cleanOptional(args.requesterPhone, 50),
      propertySnapshot: {
        name: cleanOptional(args.propertyName, 200),
        address: cleanOptional(args.propertyAddress, 500),
      },
      notes: cleanOptional(args.notes, 4000),
      requestedService: cleanOptional(args.requestedService, 200),
      source: "manual",
      leadType: args.leadType ?? "other",
      leadStage: args.leadStage ?? "new",
      lastStageChangedAt: now,
      businessName: cleanOptional(args.businessName, 200),
      businessContactTitle: cleanOptional(args.businessContactTitle, 200),
      businessWebsite: cleanOptional(args.businessWebsite, 500),
      estimatedContractValueCents: args.estimatedContractValueCents,
      estimatedFrequency: args.estimatedFrequency,
      estimatedFrequencyNotes: cleanOptional(args.estimatedFrequencyNotes, 1000),
      createdByUserId: owner._id,
    });

    return requestId;
  },
});

/**
 * Update universal lead details for a request.
 * Owner/Manager; scoped to company.
 */
export const updateLeadDetails = mutation({
  args: {
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
    requestId: v.id("clientRequests"),
    leadType: leadTypeValidator,
    businessName: v.optional(v.string()),
    businessContactTitle: v.optional(v.string()),
    businessWebsite: v.optional(v.string()),
    estimatedContractValueCents: v.optional(v.number()),
    estimatedFrequency: v.optional(estimatedFrequencyValidator),
    estimatedFrequencyNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerManagerSession(ctx, args.sessionToken, args.userId);

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    if (request.companyId !== owner.companyId) throw new Error("Access denied");

    await ctx.db.patch(args.requestId, {
      leadType: args.leadType,
      businessName: cleanOptional(args.businessName, 200),
      businessContactTitle: cleanOptional(args.businessContactTitle, 200),
      businessWebsite: cleanOptional(args.businessWebsite, 500),
      estimatedContractValueCents: args.estimatedContractValueCents,
      estimatedFrequency: args.estimatedFrequency,
      estimatedFrequencyNotes: cleanOptional(args.estimatedFrequencyNotes, 1000),
    });

    return { leadType: args.leadType };
  },
});

/**
 * Update the CRM lead stage for a request.
 * Owner-only; scoped to company.
 */
export const updateLeadStage = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    requestId: v.id("clientRequests"),
    leadStage: leadStageValidator,
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    if (request.companyId !== owner.companyId) throw new Error("Access denied");

    await ctx.db.patch(args.requestId, patchForStage(args.leadStage, request));
  },
});

/**
 * Update internal lead notes for a request.
 * Owner-only; scoped to company. Capped at 4000 chars.
 */
export const updateLeadNotes = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    requestId: v.id("clientRequests"),
    leadNotes: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);

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
    sessionToken: v.string(),
    requestId: v.id("clientRequests"),
    nextFollowUpAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);

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
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate (or return existing) portal link for a client request.
 * Owner-only.
 */
export const generateClientPortalLink = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    clientRequestId: v.id("clientRequests"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);

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
    // Rate limit: 3 public form submissions per 10 min per token
    await checkRateLimit(ctx, {
      key: `t:${args.token}:submitClientFeedback`,
      limit: 3,
      windowMs: 600_000,
    });

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
    sessionToken: v.string(),
    feedbackId: v.id("clientFeedback"),
  },
  handler: async (ctx, args) => {
    const user = await requireOwnerSession(ctx, args.sessionToken, args.userId);

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

/**
 * Toggle whether a feedback entry is featured on the public mini site.
 * Owner-only; verifies feedback belongs to caller's company.
 */
export const toggleFeedbackFeaturedOnSite = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    feedbackId: v.id("clientFeedback"),
    featured: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireOwnerSession(ctx, args.sessionToken, args.userId);

    const feedback = await ctx.db.get(args.feedbackId);
    if (!feedback) throw new Error("Feedback not found");

    const request = await ctx.db.get(feedback.clientRequestId);
    if (!request || request.companyId !== user.companyId) {
      throw new Error("Access denied");
    }

    const patch: Record<string, unknown> = { featuredOnSite: args.featured };
    // Featuring on site implicitly means the owner has reviewed this feedback;
    // the public query only shows status="reviewed" items, so auto-promote.
    if (args.featured && feedback.status === "new") {
      patch.status = "reviewed";
    }
    await ctx.db.patch(args.feedbackId, patch);
    return { ok: true };
  },
});
