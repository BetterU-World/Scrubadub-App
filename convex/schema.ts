import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  companies: defineTable({
    name: v.string(),
    timezone: v.string(),
    // Billing
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    stripePriceId: v.optional(v.string()),
    tier: v.optional(
      v.union(v.literal("cleaning_owner"), v.literal("str_owner"))
    ),
    subscriptionStatus: v.optional(v.string()),
    currentPeriodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.optional(v.boolean()),
    subscriptionBecameInactiveAt: v.optional(v.number()),
    // Client portal – public booking-request link token
    publicRequestToken: v.optional(v.string()),
  })
    .index("by_stripeCustomerId", ["stripeCustomerId"])
    .index("by_publicRequestToken", ["publicRequestToken"]),

  users: defineTable({
    email: v.string(),
    passwordHash: v.string(),
    name: v.string(),
    companyId: v.id("companies"),
    role: v.union(v.literal("owner"), v.literal("cleaner"), v.literal("maintenance")),
    status: v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("pending")
    ),
    inviteToken: v.optional(v.string()),
    inviteTokenHash: v.optional(v.string()),
    inviteTokenExpiry: v.optional(v.float64()),

    phone: v.optional(v.string()),
    resetToken: v.optional(v.string()),
    resetTokenExpiry: v.optional(v.number()),
  })
    .index("by_email", ["email"])
    .index("by_companyId", ["companyId"])
    .index("by_inviteToken", ["inviteToken"])
    .index("by_resetToken", ["resetToken"]),

  properties: defineTable({
    companyId: v.id("companies"),
    name: v.string(),
    type: v.union(
      v.literal("residential"),
      v.literal("commercial"),
      v.literal("vacation_rental"),
      v.literal("office")
    ),
    address: v.string(),
    accessInstructions: v.optional(v.string()),
    amenities: v.array(v.string()),
    // Structured inventory counts for supply tracking
    towelCount: v.optional(v.number()),
    sheetSets: v.optional(v.number()),
    pillowCount: v.optional(v.number()),
    linenTypes: v.optional(v.array(v.string())),
    supplies: v.optional(v.array(v.string())),
    beds: v.optional(v.number()),
    baths: v.optional(v.number()),
    linenCount: v.optional(v.number()),
    maintenanceNotes: v.optional(v.string()),
    ownerNotes: v.optional(v.string()),
    active: v.boolean(),
  }).index("by_companyId", ["companyId"]),

  jobs: defineTable({
    companyId: v.id("companies"),
    propertyId: v.id("properties"),
    cleanerIds: v.array(v.id("users")),
    type: v.union(
      v.literal("standard"),
      v.literal("deep_clean"),
      v.literal("turnover"),
      v.literal("move_in_out"),
      v.literal("maintenance")
    ),
    status: v.union(
      v.literal("scheduled"),
      v.literal("confirmed"),
      v.literal("denied"),
      v.literal("in_progress"),
      v.literal("submitted"),
      v.literal("approved"),
      v.literal("rework_requested"),
      v.literal("cancelled")
    ),
    scheduledDate: v.string(),
    startTime: v.optional(v.string()),
    durationMinutes: v.number(),
    notes: v.optional(v.string()),
    requireConfirmation: v.optional(v.boolean()),
    reworkCount: v.number(),
    acceptanceStatus: v.optional(
      v.union(v.literal("pending"), v.literal("accepted"), v.literal("denied"))
    ),
    acceptedAt: v.optional(v.number()),
    deniedAt: v.optional(v.number()),
    denyReason: v.optional(v.string()),
    arrivedAt: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    sourceRedFlagId: v.optional(v.id("redFlags")),
    // Shared-job fields (set on the copy created in the partner's company)
    sharedFromJobId: v.optional(v.id("jobs")),
    sharedFromCompanyName: v.optional(v.string()),
  })
    .index("by_companyId_status", ["companyId", "status"])
    .index("by_companyId_scheduledDate", ["companyId", "scheduledDate"])
    .index("by_propertyId", ["propertyId"]),

  forms: defineTable({
    jobId: v.id("jobs"),
    companyId: v.id("companies"),
    cleanerId: v.id("users"),
    cleanerScore: v.optional(v.number()),
    finalPass: v.optional(v.boolean()),
    signatureStorageId: v.optional(v.id("_storage")),
    photoStorageIds: v.optional(v.array(v.id("_storage"))),
    submittedAt: v.optional(v.number()),
    status: v.union(
      v.literal("in_progress"),
      v.literal("submitted"),
      v.literal("approved"),
      v.literal("rework_requested")
    ),
    ownerNotes: v.optional(v.string()),
    maintenanceCost: v.optional(v.number()),
    maintenanceVendor: v.optional(v.string()),
  })
    .index("by_jobId", ["jobId"])
    .index("by_cleanerId", ["cleanerId"]),

  formItems: defineTable({
    formId: v.id("forms"),
    section: v.string(),
    itemName: v.string(),
    completed: v.boolean(),
    note: v.optional(v.string()),
    isRedFlag: v.boolean(),
    photoStorageId: v.optional(v.id("_storage")),
    order: v.number(),
  })
    .index("by_formId", ["formId"])
    .index("by_formId_section", ["formId", "section"]),

  redFlags: defineTable({
    companyId: v.id("companies"),
    propertyId: v.id("properties"),
    jobId: v.id("jobs"),
    formItemId: v.optional(v.id("formItems")),
    category: v.union(
      v.literal("damage"),
      v.literal("safety"),
      v.literal("cleanliness"),
      v.literal("maintenance"),
      v.literal("other")
    ),
    severity: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical")
    ),
    note: v.string(),
    photoStorageId: v.optional(v.id("_storage")),
    status: v.union(
      v.literal("open"),
      v.literal("acknowledged"),
      v.literal("resolved")
    ),
    ownerNote: v.optional(v.string()),
    maintenanceJobId: v.optional(v.id("jobs")),
  })
    .index("by_companyId_status", ["companyId", "status"])
    .index("by_jobId", ["jobId"])
    .index("by_propertyId", ["propertyId"]),

  notifications: defineTable({
    companyId: v.id("companies"),
    userId: v.id("users"),
    type: v.union(
      v.literal("job_assigned"),
      v.literal("job_confirmed"),
      v.literal("job_denied"),
      v.literal("job_started"),
      v.literal("job_submitted"),
      v.literal("job_approved"),
      v.literal("job_accepted"),
      v.literal("job_reassigned"),
      v.literal("rework_requested"),
      v.literal("red_flag"),
      v.literal("invite"),
      v.literal("job_shared"),
      v.literal("partner_request"),
      v.literal("partner_accepted"),
      v.literal("shared_job_accepted"),
      v.literal("shared_job_rejected")
    ),
    title: v.string(),
    message: v.string(),
    read: v.boolean(),
    relatedJobId: v.optional(v.id("jobs")),
  }).index("by_userId_read", ["userId", "read"]),

  auditLog: defineTable({
    companyId: v.id("companies"),
    userId: v.id("users"),
    action: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    details: v.optional(v.string()),
    timestamp: v.number(),
  }).index("by_companyId_timestamp", ["companyId", "timestamp"]),

  // ── Owner-to-Owner job sharing (Phase 1) ──────────────────────────

  partnerContacts: defineTable({
    companyId: v.id("companies"),
    name: v.string(),
    email: v.string(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_companyId", ["companyId"]),

  ownerConnections: defineTable({
    companyAId: v.id("companies"),
    companyBId: v.id("companies"),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("active"),
        v.literal("declined"),
        v.literal("disconnected")
      )
    ),
    initiatorCompanyId: v.optional(v.id("companies")),
    createdAt: v.number(),
    respondedAt: v.optional(v.number()),
  })
    .index("by_companyAId", ["companyAId"])
    .index("by_companyBId", ["companyBId"])
    .index("by_companyBId_status", ["companyBId", "status"])
    .index("by_companyAId_status", ["companyAId", "status"]),

  sharedJobs: defineTable({
    originalJobId: v.id("jobs"),
    copiedJobId: v.id("jobs"),
    fromCompanyId: v.id("companies"),
    toCompanyId: v.id("companies"),
    sharePackage: v.boolean(),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("rejected"),
      v.literal("in_progress"),
      v.literal("completed")
    ),
    respondedAt: v.optional(v.number()),
    // Completion package fields (populated when sharePackage=true and job is completed)
    completionNotes: v.optional(v.string()),
    checklistSummary: v.optional(v.string()),
    photoStorageIds: v.optional(v.array(v.id("_storage"))),
    completedAt: v.optional(v.number()),
  })
    .index("by_originalJobId", ["originalJobId"])
    .index("by_copiedJobId", ["copiedJobId"])
    .index("by_fromCompanyId", ["fromCompanyId"])
    .index("by_toCompanyId", ["toCompanyId"])
    .index("by_toCompanyId_status", ["toCompanyId", "status"]),

  // ── Client Portal (Phase 1) ───────────────────────────────────────

  clientRequests: defineTable({
    companyId: v.id("companies"),
    createdAt: v.number(),
    status: v.union(
      v.literal("new"),
      v.literal("accepted"),
      v.literal("declined"),
      v.literal("converted")
    ),
    requesterName: v.string(),
    requesterEmail: v.string(),
    requesterPhone: v.optional(v.string()),
    propertySnapshot: v.object({
      name: v.optional(v.string()),
      address: v.optional(v.string()),
      notes: v.optional(v.string()),
    }),
    requestedDate: v.optional(v.string()),
    requestedStart: v.optional(v.string()),
    requestedEnd: v.optional(v.string()),
    timeWindow: v.optional(v.string()),
    notes: v.optional(v.string()),
    source: v.literal("public_link"),
  })
    .index("by_companyId", ["companyId"])
    .index("by_companyId_status", ["companyId", "status"]),
});
