import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  companies: defineTable({
    name: v.string(),
    timezone: v.string(),
  }),

  users: defineTable({
    email: v.string(),
    passwordHash: v.string(),
    name: v.string(),
    companyId: v.id("companies"),
    role: v.union(v.literal("owner"), v.literal("cleaner")),
    status: v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("pending")
    ),
    // Legacy token fields (kept for migration, cleared on use)
    inviteToken: v.optional(v.string()),
    resetToken: v.optional(v.string()),
    // Secure hashed token fields
    inviteTokenHash: v.optional(v.string()),
    inviteTokenExpiry: v.optional(v.number()),
    resetTokenHash: v.optional(v.string()),
    resetTokenExpiry: v.optional(v.number()),
    phone: v.optional(v.string()),
  })
    .index("by_email", ["email"])
    .index("by_companyId", ["companyId"])
    .index("by_inviteToken", ["inviteToken"])
    .index("by_resetToken", ["resetToken"])
    .index("by_inviteTokenHash", ["inviteTokenHash"])
    .index("by_resetTokenHash", ["resetTokenHash"]),

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
    towelCount: v.optional(v.number()),
    sheetSets: v.optional(v.number()),
    pillowCount: v.optional(v.number()),
    linenTypes: v.optional(v.array(v.string())),
    supplies: v.optional(v.array(v.string())),
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
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    sourceRedFlagId: v.optional(v.id("redFlags")),
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
    submittedAt: v.optional(v.number()),
    status: v.union(
      v.literal("in_progress"),
      v.literal("submitted"),
      v.literal("approved"),
      v.literal("rework_requested")
    ),
    ownerNotes: v.optional(v.string()),
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
      v.literal("rework_requested"),
      v.literal("red_flag"),
      v.literal("invite")
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
});
