import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireOwner, logAudit, createNotification } from "../lib/helpers";
import { requireActiveSubscription } from "../lib/subscriptionGating";

// ── Partner Contacts ──────────────────────────────────────────────

export const addContact = mutation({
  args: {
    userId: v.optional(v.id("users")),
    name: v.string(),
    email: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    await requireActiveSubscription(ctx, owner.companyId);

    const id = await ctx.db.insert("partnerContacts", {
      companyId: owner.companyId,
      name: args.name,
      email: args.email.toLowerCase().trim(),
      notes: args.notes,
      createdAt: Date.now(),
    });

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: "add_partner_contact",
      entityType: "partnerContacts",
      entityId: id,
    });

    return id;
  },
});

export const removeContact = mutation({
  args: {
    userId: v.optional(v.id("users")),
    contactId: v.id("partnerContacts"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const contact = await ctx.db.get(args.contactId);
    if (!contact) throw new Error("Contact not found");
    if (contact.companyId !== owner.companyId) throw new Error("Not your contact");

    await ctx.db.delete(args.contactId);

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: "remove_partner_contact",
      entityType: "partnerContacts",
      entityId: args.contactId,
    });
  },
});

// ── Owner Connections ─────────────────────────────────────────────

/** Status for a connection record (legacy rows have no status field → treat as active) */
function connStatus(c: { status?: string }): string {
  return c.status ?? "active";
}

export const connectByEmail = mutation({
  args: {
    userId: v.optional(v.id("users")),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    await requireActiveSubscription(ctx, owner.companyId);

    const normalizedEmail = args.email.toLowerCase().trim();

    // Find an owner user with this email
    const targetUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .first();

    if (!targetUser || targetUser.role !== "owner") {
      return { success: false as const, reason: "not_found" };
    }
    if (targetUser.companyId === owner.companyId) {
      return { success: false as const, reason: "same_company" };
    }

    // Check if connection already exists (in either direction)
    const existingA = await ctx.db
      .query("ownerConnections")
      .withIndex("by_companyAId", (q) => q.eq("companyAId", owner.companyId))
      .collect();
    const forwardMatch = existingA.find(
      (c) => c.companyBId === targetUser.companyId
    );

    const existingB = await ctx.db
      .query("ownerConnections")
      .withIndex("by_companyAId", (q) => q.eq("companyAId", targetUser.companyId))
      .collect();
    const reverseMatch = existingB.find(
      (c) => c.companyBId === owner.companyId
    );

    const existing = forwardMatch || reverseMatch;
    if (existing) {
      const st = connStatus(existing);
      if (st === "active") return { success: false as const, reason: "already_connected" };
      if (st === "pending") return { success: false as const, reason: "already_pending" };
      // declined / disconnected → remove old record so we can re-invite
      await ctx.db.delete(existing._id);
    }

    const connId = await ctx.db.insert("ownerConnections", {
      companyAId: owner.companyId,
      companyBId: targetUser.companyId,
      status: "pending",
      initiatorCompanyId: owner.companyId,
      createdAt: Date.now(),
    });

    // Notify recipient company's owners
    const targetCompany = await ctx.db.get(targetUser.companyId);
    const ownerCompany = await ctx.db.get(owner.companyId);
    const recipientOwners = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", targetUser.companyId))
      .collect();
    for (const ro of recipientOwners.filter((u) => u.role === "owner")) {
      await createNotification(ctx, {
        companyId: targetUser.companyId,
        userId: ro._id,
        type: "partner_request",
        title: "Partner Connection Request",
        message: `${ownerCompany?.name ?? "A company"} wants to connect for job sharing`,
      });
    }

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: "create_owner_connection",
      entityType: "ownerConnections",
      entityId: connId,
    });

    return {
      success: true as const,
      connectionId: connId,
      companyName: targetCompany?.name ?? "Unknown",
    };
  },
});

export const acceptConnection = mutation({
  args: {
    userId: v.optional(v.id("users")),
    connectionId: v.id("ownerConnections"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const conn = await ctx.db.get(args.connectionId);
    if (!conn) throw new Error("Connection not found");
    if (connStatus(conn) !== "pending") throw new Error("Connection is not pending");
    if (conn.companyBId !== owner.companyId) throw new Error("Not authorized");

    await ctx.db.patch(args.connectionId, {
      status: "active",
      respondedAt: Date.now(),
    });

    // Upsert partnerContacts for both sides
    const initiatorCompany = await ctx.db.get(conn.companyAId);
    const recipientCompany = await ctx.db.get(conn.companyBId);
    const initiatorOwners = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", conn.companyAId))
      .collect();
    const initiatorOwner = initiatorOwners.find((u) => u.role === "owner");

    // Add initiator as contact in recipient's company
    if (initiatorOwner) {
      const recipientContacts = await ctx.db
        .query("partnerContacts")
        .withIndex("by_companyId", (q) => q.eq("companyId", owner.companyId))
        .collect();
      if (!recipientContacts.some((c) => c.email === initiatorOwner.email)) {
        await ctx.db.insert("partnerContacts", {
          companyId: owner.companyId,
          name: initiatorCompany?.name ?? initiatorOwner.name,
          email: initiatorOwner.email,
          createdAt: Date.now(),
        });
      }
    }

    // Add recipient as contact in initiator's company
    const initiatorContacts = await ctx.db
      .query("partnerContacts")
      .withIndex("by_companyId", (q) => q.eq("companyId", conn.companyAId))
      .collect();
    if (!initiatorContacts.some((c) => c.email === owner.email)) {
      await ctx.db.insert("partnerContacts", {
        companyId: conn.companyAId,
        name: recipientCompany?.name ?? owner.name,
        email: owner.email,
        createdAt: Date.now(),
      });
    }

    // Notify initiator owners
    for (const io of initiatorOwners.filter((u) => u.role === "owner")) {
      await createNotification(ctx, {
        companyId: conn.companyAId,
        userId: io._id,
        type: "partner_accepted",
        title: "Connection Accepted",
        message: `${recipientCompany?.name ?? "A partner"} accepted your connection request`,
      });
    }

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: "accept_connection",
      entityType: "ownerConnections",
      entityId: args.connectionId,
    });
  },
});

export const declineConnection = mutation({
  args: {
    userId: v.optional(v.id("users")),
    connectionId: v.id("ownerConnections"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const conn = await ctx.db.get(args.connectionId);
    if (!conn) throw new Error("Connection not found");
    if (connStatus(conn) !== "pending") throw new Error("Connection is not pending");
    if (conn.companyBId !== owner.companyId) throw new Error("Not authorized");

    await ctx.db.patch(args.connectionId, {
      status: "declined",
      respondedAt: Date.now(),
    });

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: "decline_connection",
      entityType: "ownerConnections",
      entityId: args.connectionId,
    });
  },
});

export const disconnectConnection = mutation({
  args: {
    userId: v.optional(v.id("users")),
    connectionId: v.id("ownerConnections"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const conn = await ctx.db.get(args.connectionId);
    if (!conn) throw new Error("Connection not found");
    if (connStatus(conn) !== "active") throw new Error("Connection is not active");
    // Either party can disconnect
    if (conn.companyAId !== owner.companyId && conn.companyBId !== owner.companyId) {
      throw new Error("Not authorized");
    }

    await ctx.db.patch(args.connectionId, {
      status: "disconnected" as const,
      respondedAt: Date.now(),
    });

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: "disconnect_connection",
      entityType: "ownerConnections",
      entityId: args.connectionId,
    });
  },
});

// ── Shared Job Accept / Reject ────────────────────────────────────

export const acceptSharedJob = mutation({
  args: {
    userId: v.optional(v.id("users")),
    sharedJobId: v.id("sharedJobs"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const shared = await ctx.db.get(args.sharedJobId);
    if (!shared) throw new Error("Shared job not found");
    if (shared.toCompanyId !== owner.companyId) throw new Error("Not authorized");
    if (shared.status !== "pending") throw new Error("Shared job is not pending");

    await ctx.db.patch(args.sharedJobId, {
      status: "accepted",
      respondedAt: Date.now(),
    });

    // Notify originator owners
    const fromOwners = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", shared.fromCompanyId))
      .collect();
    const toCompany = await ctx.db.get(shared.toCompanyId);
    const copiedJob = await ctx.db.get(shared.copiedJobId);
    for (const fo of fromOwners.filter((u) => u.role === "owner")) {
      await createNotification(ctx, {
        companyId: shared.fromCompanyId,
        userId: fo._id,
        type: "shared_job_accepted",
        title: "Shared Job Accepted",
        message: `${toCompany?.name ?? "A partner"} accepted the shared job for ${copiedJob?.scheduledDate ?? ""}`.trim(),
        relatedJobId: shared.originalJobId,
      });
    }

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: "accept_shared_job",
      entityType: "sharedJobs",
      entityId: args.sharedJobId,
    });
  },
});

export const rejectSharedJob = mutation({
  args: {
    userId: v.optional(v.id("users")),
    sharedJobId: v.id("sharedJobs"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const shared = await ctx.db.get(args.sharedJobId);
    if (!shared) throw new Error("Shared job not found");
    if (shared.toCompanyId !== owner.companyId) throw new Error("Not authorized");
    if (shared.status !== "pending") throw new Error("Shared job is not pending");

    await ctx.db.patch(args.sharedJobId, {
      status: "rejected",
      respondedAt: Date.now(),
    });

    // Cancel the copied job so it leaves Owner2's active list
    await ctx.db.patch(shared.copiedJobId, { status: "cancelled" });

    // Notify originator owners
    const fromOwners = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", shared.fromCompanyId))
      .collect();
    const toCompany = await ctx.db.get(shared.toCompanyId);
    const copiedJob = await ctx.db.get(shared.copiedJobId);
    for (const fo of fromOwners.filter((u) => u.role === "owner")) {
      await createNotification(ctx, {
        companyId: shared.fromCompanyId,
        userId: fo._id,
        type: "shared_job_rejected",
        title: "Shared Job Rejected",
        message: `${toCompany?.name ?? "A partner"} rejected the shared job for ${copiedJob?.scheduledDate ?? ""}`.trim(),
        relatedJobId: shared.originalJobId,
      });
    }

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: "reject_shared_job",
      entityType: "sharedJobs",
      entityId: args.sharedJobId,
    });
  },
});

// ── Share Job ─────────────────────────────────────────────────────

export const shareJob = mutation({
  args: {
    userId: v.optional(v.id("users")),
    jobId: v.id("jobs"),
    toCompanyId: v.id("companies"),
    sharePackage: v.boolean(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    await requireActiveSubscription(ctx, owner.companyId);

    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.companyId !== owner.companyId) throw new Error("Not your job");

    // Verify an active connection exists
    const connectionsA = await ctx.db
      .query("ownerConnections")
      .withIndex("by_companyAId", (q) => q.eq("companyAId", owner.companyId))
      .collect();
    const connectionsB = await ctx.db
      .query("ownerConnections")
      .withIndex("by_companyBId", (q) => q.eq("companyBId", owner.companyId))
      .collect();
    const allConnected = [
      ...connectionsA.filter((c) => connStatus(c) === "active").map((c) => c.companyBId),
      ...connectionsB.filter((c) => connStatus(c) === "active").map((c) => c.companyAId),
    ];
    if (!allConnected.includes(args.toCompanyId)) {
      throw new Error("Not connected to this company");
    }

    // Check not already shared to this company
    const existing = await ctx.db
      .query("sharedJobs")
      .withIndex("by_originalJobId", (q) => q.eq("originalJobId", args.jobId))
      .collect();
    if (existing.some((s) => s.toCompanyId === args.toCompanyId)) {
      throw new Error("Job already shared to this company");
    }

    // Get property snapshot for the copied job
    const property = await ctx.db.get(job.propertyId);
    const fromCompany = await ctx.db.get(owner.companyId);
    const toCompany = await ctx.db.get(args.toCompanyId);

    // Create a snapshot property in the target company
    const snapshotPropertyId = await ctx.db.insert("properties", {
      companyId: args.toCompanyId,
      name: property?.name ?? "Shared Property",
      type: property?.type ?? "residential",
      address: property?.address ?? "See original job notes",
      accessInstructions: property?.accessInstructions,
      amenities: property?.amenities ?? [],
      beds: property?.beds,
      baths: property?.baths,
      ownerNotes: `Shared from ${fromCompany?.name ?? "partner"}. ${property?.ownerNotes ?? ""}`.trim(),
      active: true,
    });

    // Create the copied job in the target company
    const copiedJobId = await ctx.db.insert("jobs", {
      companyId: args.toCompanyId,
      propertyId: snapshotPropertyId,
      cleanerIds: [], // Owner2 assigns their own cleaners
      type: job.type,
      status: "scheduled",
      scheduledDate: job.scheduledDate,
      startTime: job.startTime,
      durationMinutes: job.durationMinutes,
      notes: job.notes
        ? `[Shared from ${fromCompany?.name ?? "partner"}] ${job.notes}`
        : `[Shared from ${fromCompany?.name ?? "partner"}]`,
      reworkCount: 0,
      sharedFromJobId: args.jobId,
      sharedFromCompanyName: fromCompany?.name ?? "Partner",
    });

    // Create the sharedJobs record
    const sharedJobId = await ctx.db.insert("sharedJobs", {
      originalJobId: args.jobId,
      copiedJobId: copiedJobId,
      fromCompanyId: owner.companyId,
      toCompanyId: args.toCompanyId,
      sharePackage: args.sharePackage,
      status: "pending",
    });

    // Notify the target company's owners
    const targetOwners = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.toCompanyId))
      .collect();
    for (const targetOwner of targetOwners.filter((u) => u.role === "owner")) {
      await createNotification(ctx, {
        companyId: args.toCompanyId,
        userId: targetOwner._id,
        type: "job_shared",
        title: "Job Shared With You",
        message: `${fromCompany?.name ?? "A partner"} shared a ${job.type.replace(/_/g, " ")} job for ${job.scheduledDate}`,
        relatedJobId: copiedJobId,
      });
    }

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: "share_job",
      entityType: "sharedJobs",
      entityId: sharedJobId,
      details: `Shared to ${toCompany?.name ?? args.toCompanyId}`,
    });

    return { sharedJobId, copiedJobId };
  },
});
