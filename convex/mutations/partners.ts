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
    const alreadyConnected = existingA.some(
      (c) => c.companyBId === targetUser.companyId
    );
    if (alreadyConnected) {
      return { success: false as const, reason: "already_connected" };
    }
    const existingB = await ctx.db
      .query("ownerConnections")
      .withIndex("by_companyAId", (q) => q.eq("companyAId", targetUser.companyId))
      .collect();
    const alreadyConnectedReverse = existingB.some(
      (c) => c.companyBId === owner.companyId
    );
    if (alreadyConnectedReverse) {
      return { success: false as const, reason: "already_connected" };
    }

    const connId = await ctx.db.insert("ownerConnections", {
      companyAId: owner.companyId,
      companyBId: targetUser.companyId,
      createdAt: Date.now(),
    });

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: "create_owner_connection",
      entityType: "ownerConnections",
      entityId: connId,
    });

    const targetCompany = await ctx.db.get(targetUser.companyId);
    return {
      success: true as const,
      connectionId: connId,
      companyName: targetCompany?.name ?? "Unknown",
    };
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

    // Verify connection exists
    const connectionsA = await ctx.db
      .query("ownerConnections")
      .withIndex("by_companyAId", (q) => q.eq("companyAId", owner.companyId))
      .collect();
    const connectionsB = await ctx.db
      .query("ownerConnections")
      .withIndex("by_companyBId", (q) => q.eq("companyBId", owner.companyId))
      .collect();
    const allConnected = [
      ...connectionsA.map((c) => c.companyBId),
      ...connectionsB.map((c) => c.companyAId),
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
