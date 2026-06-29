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
      v.union(
        v.literal("cleaning_owner"),
        v.literal("str_owner"),
        v.literal("scrub_solo"),
        v.literal("scrub_team"),
        v.literal("scrub_pro"),
      )
    ),
    subscriptionStatus: v.optional(v.string()),
    currentPeriodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.optional(v.boolean()),
    subscriptionBecameInactiveAt: v.optional(v.number()),
    // Stripe Connect (company-level Express account)
    stripeConnectAccountId: v.optional(v.string()),
    stripeConnectOnboardedAt: v.optional(v.number()),
    // Company profile defaults (feed microsites via fallback)
    companyDisplayName: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    serviceAreaText: v.optional(v.string()),
    // Client portal - public booking-request link token
    publicRequestToken: v.optional(v.string()),
    // Default manager for new jobs
    defaultManagerId: v.optional(v.id("users")),
  })
    .index("by_stripeCustomerId", ["stripeCustomerId"])
    .index("by_publicRequestToken", ["publicRequestToken"]),

  users: defineTable({
    email: v.string(),
    passwordHash: v.string(),
    name: v.string(),
    companyId: v.optional(v.id("companies")),
    role: v.union(v.literal("owner"), v.literal("cleaner"), v.literal("maintenance"), v.literal("manager"), v.literal("affiliate")),
    // Manager permission flags (only meaningful when role === "manager")
    canSeeAllJobs: v.optional(v.boolean()),
    canCreateJobs: v.optional(v.boolean()),
    canAssignCleaners: v.optional(v.boolean()),
    canRequestRework: v.optional(v.boolean()),
    canApproveForms: v.optional(v.boolean()),
    canManageSchedule: v.optional(v.boolean()),
    canResolveRedFlags: v.optional(v.boolean()),
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
    referralCode: v.optional(v.string()),
    referredByCode: v.optional(v.string()),
    referredByUserId: v.optional(v.id("users")),
    // Stripe Connect (Express onboarding)
    stripeConnectAccountId: v.optional(v.string()),
    stripeConnectOnboardingStatus: v.optional(
      v.union(
        v.literal("not_started"),
        v.literal("in_progress"),
        v.literal("complete")
      )
    ),
    stripeConnectPayoutsEnabled: v.optional(v.boolean()),
    stripeConnectDetailsSubmitted: v.optional(v.boolean()),
    stripeConnectRequirementsDue: v.optional(v.string()),
    stripeConnectLastSyncAt: v.optional(v.number()),
    // Affiliate Stripe Connect (may reuse company Connect account)
    affiliateStripeAccountId: v.optional(v.string()),
    affiliateStripeOnboardedAt: v.optional(v.number()),
    // Affiliate invite tracking (who invited this affiliate)
    affiliateInvitedBy: v.optional(v.id("users")),
  })
    .index("by_email", ["email"])
    .index("by_companyId", ["companyId"])
    .index("by_inviteToken", ["inviteToken"])
    .index("by_resetToken", ["resetToken"])
    .index("by_referralCode", ["referralCode"])
    .index("by_referredByCode", ["referredByCode"]),

  workerProfiles: defineTable({
    companyId: v.id("companies"),
    userId: v.id("users"),
    workerType: v.union(
      v.literal("w2_employee"),
      v.literal("contractor_1099"),
      v.literal("maintenance_contractor"),
      v.literal("vendor")
    ),
    workerStatus: v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("inactive"),
      v.literal("archived")
    ),
    primaryRole: v.union(
      v.literal("cleaner"),
      v.literal("manager"),
      v.literal("maintenance"),
      v.literal("inspector"),
      v.literal("team_lead")
    ),
    eligibleRoles: v.array(
      v.union(
        v.literal("cleaner"),
        v.literal("manager"),
        v.literal("maintenance"),
        v.literal("inspector"),
        v.literal("team_lead")
      )
    ),
    onboardingStatus: v.union(
      v.literal("not_started"),
      v.literal("in_progress"),
      v.literal("blocked"),
      v.literal("complete"),
      v.literal("waived")
    ),
    jobEligibilityStatus: v.union(
      v.literal("eligible"),
      v.literal("limited"),
      v.literal("ineligible"),
      v.literal("manual_review")
    ),
    payProfile: v.optional(v.object({
      payType: v.optional(v.union(
        v.literal("hourly"),
        v.literal("per_job"),
        v.literal("salary"),
        v.literal("vendor_invoice"),
        v.literal("manual")
      )),
      defaultRateCents: v.optional(v.number()),
      currency: v.optional(v.string()),
      stripeConnectEnabled: v.optional(v.boolean()),
      stripeConnectUserFieldSource: v.optional(v.literal("users")),
      outsideAppPaymentNotes: v.optional(v.string()),
      taxDocsHandledOffPlatform: v.optional(v.boolean()),
    })),
    manualComplianceNotes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_companyId", ["companyId"])
    .index("by_userId", ["userId"])
    .index("by_companyId_status", ["companyId", "workerStatus"])
    .index("by_companyId_workerType", ["companyId", "workerType"]),

  workerDocuments: defineTable({
    companyId: v.id("companies"),
    workerProfileId: v.id("workerProfiles"),
    userId: v.id("users"),
    documentType: v.union(
      v.literal("contractor_agreement"),
      v.literal("employee_handbook_ack"),
      v.literal("w9_record"),
      v.literal("insurance_record"),
      v.literal("background_check_record"),
      v.literal("training_record"),
      v.literal("policy_ack"),
      v.literal("other")
    ),
    status: v.union(
      v.literal("not_started"),
      v.literal("requested"),
      v.literal("received"),
      v.literal("reviewed"),
      v.literal("expired"),
      v.literal("waived")
    ),
    required: v.boolean(),
    handledOffPlatform: v.boolean(),
    expiresAt: v.optional(v.number()),
    reviewedAt: v.optional(v.number()),
    reviewedByUserId: v.optional(v.id("users")),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_companyId", ["companyId"])
    .index("by_workerProfileId", ["workerProfileId"])
    .index("by_userId", ["userId"])
    .index("by_workerProfileId_documentType", ["workerProfileId", "documentType"]),

  workerOnboardingItems: defineTable({
    companyId: v.id("companies"),
    workerProfileId: v.id("workerProfiles"),
    userId: v.id("users"),
    itemKey: v.string(),
    title: v.string(),
    status: v.union(
      v.literal("not_started"),
      v.literal("in_progress"),
      v.literal("complete"),
      v.literal("blocked"),
      v.literal("waived")
    ),
    required: v.boolean(),
    completedAt: v.optional(v.number()),
    completedByUserId: v.optional(v.id("users")),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_companyId", ["companyId"])
    .index("by_workerProfileId", ["workerProfileId"])
    .index("by_userId", ["userId"])
    .index("by_workerProfileId_itemKey", ["workerProfileId", "itemKey"]),

  companyOnboardingDocuments: defineTable({
    companyId: v.id("companies"),
    documentKey: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    required: v.boolean(),
    roleVisibility: v.union(
      v.literal("cleaner"),
      v.literal("maintenance"),
      v.literal("both")
    ),
    status: v.union(
      v.literal("active"),
      v.literal("inactive")
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_companyId", ["companyId"])
    .index("by_companyId_documentKey", ["companyId", "documentKey"]),

  clientUsers: defineTable({
    email: v.string(),
    passwordHash: v.optional(v.string()),
    displayName: v.string(),
    phone: v.optional(v.string()),
    language: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("disabled"),
      v.literal("pending")
    ),
    inviteTokenHash: v.optional(v.string()),
    inviteTokenExpiry: v.optional(v.number()),
    resetToken: v.optional(v.string()),
    resetTokenExpiry: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_status", ["status"]),

  clientRelationships: defineTable({
    companyId: v.id("companies"),
    clientUserId: v.optional(v.id("clientUsers")),
    displayName: v.string(),
    clientType: v.union(
      v.literal("residential"),
      v.literal("commercial"),
      v.literal("str"),
      v.literal("property_manager"),
      v.literal("marketplace")
    ),
    businessName: v.optional(v.string()),
    primaryContactName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    notes: v.optional(v.string()),
    pendingInviteClientUserId: v.optional(v.id("clientUsers")),
    inviteTokenHash: v.optional(v.string()),
    inviteTokenExpiry: v.optional(v.number()),
    inviteSentAt: v.optional(v.number()),
    status: v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("archived")
    ),
    sourceClientRequestId: v.optional(v.id("clientRequests")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_companyId", ["companyId"])
    .index("by_clientUserId", ["clientUserId"])
    .index("by_inviteTokenHash", ["inviteTokenHash"])
    .index("by_companyId_status", ["companyId", "status"])
    .index("by_companyId_email", ["companyId", "email"]),

  teams: defineTable({
    companyId: v.id("companies"),
    name: v.string(),
    description: v.optional(v.string()),
    active: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_companyId", ["companyId"])
    .index("by_companyId_active", ["companyId", "active"]),

  teamMembers: defineTable({
    teamId: v.id("teams"),
    companyId: v.id("companies"),
    userId: v.id("users"),
    role: v.union(v.literal("lead"), v.literal("member")),
    active: v.boolean(),
    addedAt: v.number(),
    removedAt: v.optional(v.number()),
  })
    .index("by_teamId", ["teamId"])
    .index("by_companyId", ["companyId"])
    .index("by_userId", ["userId"])
    .index("by_userId_active", ["userId", "active"])
    .index("by_teamId_userId", ["teamId", "userId"]),

  properties: defineTable({
    companyId: v.id("companies"),
    clientRelationshipId: v.optional(v.id("clientRelationships")),
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
    hasStandaloneTub: v.optional(v.boolean()),
    showerGlassDoorCount: v.optional(v.number()),
    maintenanceNotes: v.optional(v.string()),
    ownerNotes: v.optional(v.string()),
    // Expanded property fields (SCRUB expansion)
    squareFootage: v.optional(v.number()),
    trashCanCount: v.optional(v.number()),
    restroomCount: v.optional(v.number()),
    active: v.boolean(),
    // Property Inventory (Sprint 2)
    inventoryItems: v.optional(v.array(v.object({
      name: v.string(),
      category: v.string(),
      parLevel: v.number(),
      required: v.boolean(),
      currentQty: v.optional(v.number()),
      lastCheckedAt: v.optional(v.number()),
      lastCheckedBy: v.optional(v.id("users")),
      restockResponsibility: v.optional(v.string()),
      notes: v.optional(v.string()),
    }))),
    inventoryTemplateId: v.optional(v.id("inventoryTemplates")),
  }).index("by_companyId", ["companyId"]),

  jobs: defineTable({
    companyId: v.id("companies"),
    clientRelationshipId: v.optional(v.id("clientRelationships")),
    propertyId: v.optional(v.id("properties")),
    cleanerIds: v.array(v.id("users")),
    type: v.union(
      v.literal("standard"),
      v.literal("deep_clean"),
      v.literal("turnover"),
      v.literal("move_in_out"),
      v.literal("maintenance"),
      v.literal("post_construction")
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
    commercialAccountId: v.optional(v.id("commercialAccounts")),
    commercialScheduleId: v.optional(v.id("commercialSchedules")),
    generatedFromCommercialSchedule: v.optional(v.boolean()),
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
    // Planned cleaner pay amount (owner-set, before actual payment)
    plannedCleanerPayCents: v.optional(v.number()),
    // Cleaner payment pointer
    cleanerPaymentId: v.optional(v.id("cleanerPayments")),
    // Optional manager assignment (single manager per job)
    assignedManagerId: v.optional(v.id("users")),
    // Optional cleaner team assignment. Existing individual assignment remains cleanerIds.
    assignedTeamId: v.optional(v.id("teams")),
    // Inspection cycle: false after manager submits, true when owner reopens
    inspectionCycleOpen: v.optional(v.boolean()),
    // Property snapshot for shared jobs (Owner2 sees property info without owning the record)
    propertySnapshot: v.optional(v.object({
      name: v.optional(v.string()),
      type: v.optional(v.string()),
      address: v.optional(v.string()),
      accessInstructions: v.optional(v.string()),
      beds: v.optional(v.number()),
      baths: v.optional(v.number()),
      amenities: v.optional(v.array(v.string())),
      towelCount: v.optional(v.number()),
      sheetSets: v.optional(v.number()),
      pillowCount: v.optional(v.number()),
      ownerNotes: v.optional(v.string()),
      squareFootage: v.optional(v.number()),
      trashCanCount: v.optional(v.number()),
      restroomCount: v.optional(v.number()),
    })),
    // Calendar sync source metadata
    source: v.optional(v.union(v.literal("manual"), v.literal("calendar_sync"))),
    sourceConnectionId: v.optional(v.id("calendarConnections")),
    sourcePlatform: v.optional(v.union(
      v.literal("airbnb"),
      v.literal("vrbo"),
      v.literal("other")
    )),
    sourceReservationId: v.optional(v.id("calendarReservations")),
    // Inventory checklist snapshot (Sprint 2, Batch 4)
    // Snapshotted from property at job start; cleaners report status per item.
    inventoryChecklist: v.optional(v.array(v.object({
      name: v.string(),
      category: v.string(),
      parLevel: v.number(),
      required: v.boolean(),
      // Cleaner-reported fields
      status: v.optional(v.union(
        v.literal("ok"),
        v.literal("low"),
        v.literal("out"),
        v.literal("restocked")
      )),
      reportedQty: v.optional(v.number()),
      note: v.optional(v.string()),
    }))),
  })
    .index("by_companyId_status", ["companyId", "status"])
    .index("by_companyId_scheduledDate", ["companyId", "scheduledDate"])
    .index("by_propertyId", ["propertyId"])
    .index("by_commercialAccount", ["commercialAccountId"])
    .index("by_commercialSchedule", ["commercialScheduleId"]),

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
      v.literal("inspection"),
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
      v.literal("in_progress"),
      v.literal("resolved"),
      v.literal("wont_fix")
    ),
    ownerNote: v.optional(v.string()),
    maintenanceJobId: v.optional(v.id("jobs")),
    inspectionId: v.optional(v.id("managerInspections")),
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
      v.literal("shared_job_rejected"),
      v.literal("new_client_request"),
      v.literal("inspection_submitted"),
      v.literal("calendar_sync_alert")
    ),
    title: v.string(),
    message: v.string(),
    read: v.boolean(),
    relatedJobId: v.optional(v.id("jobs")),
    relatedClientRequestId: v.optional(v.id("clientRequests")),
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

  // Owner-to-Owner job sharing (Phase 1)

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

  // Owner Mini Sites (v1)

  companySites: defineTable({
    companyId: v.id("companies"),
    slug: v.string(),
    templateId: v.union(v.literal("A"), v.literal("B")),
    brandName: v.string(),
    bio: v.string(),
    serviceArea: v.string(),
    logoUrl: v.optional(v.string()),
    heroImageUrl: v.optional(v.string()),
    // v1 polish
    services: v.optional(v.array(v.string())),
    publicEmail: v.optional(v.string()),
    publicPhone: v.optional(v.string()),
    metaDescription: v.optional(v.string()),
  })
    .index("by_companyId", ["companyId"])
    .index("by_slug", ["slug"]),

  // Cleaner Leads (v1)

  cleanerLeads: defineTable({
    companyId: v.id("companies"),
    createdAt: v.number(),
    status: v.union(
      v.literal("new"),
      v.literal("reviewed"),
      v.literal("contacted"),
      v.literal("archived")
    ),
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    city: v.optional(v.string()),
    hasCar: v.optional(v.boolean()),
    experience: v.optional(v.string()),
    availability: v.optional(v.string()),
    notes: v.optional(v.string()),
  })
    .index("by_companyId_createdAt", ["companyId", "createdAt"])
    .index("by_companyId_status_createdAt", ["companyId", "status", "createdAt"]),

  // Client Portal (Phase 1)

  // Affiliate Attribution (revenue tracking)
  affiliateAttributions: defineTable({
    purchaserUserId: v.id("users"),
    referrerUserId: v.id("users"),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    attributionType: v.optional(
      v.union(v.literal("subscription_created"), v.literal("invoice_paid"))
    ),
    stripeInvoiceId: v.optional(v.string()),
    amountCents: v.optional(v.number()),
    currency: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_purchaserUserId", ["purchaserUserId"])
    .index("by_referrerUserId", ["referrerUserId"])
    .index("by_stripeSubscriptionId", ["stripeSubscriptionId"])
    .index("by_stripeInvoiceId", ["stripeInvoiceId"]),

  // Affiliate Ledger (payout-ready foundation)
  affiliateLedger: defineTable({
    referrerUserId: v.id("users"),
    periodType: v.union(v.literal("monthly"), v.literal("weekly")),
    periodStart: v.number(),
    periodEnd: v.number(),
    attributedRevenueCents: v.number(),
    commissionRate: v.number(),
    commissionCents: v.number(),
    status: v.union(
      v.literal("open"),
      v.literal("locked"),
      v.literal("paid")
    ),
    createdAt: v.number(),
    lockedAt: v.optional(v.number()),
    paidAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    payoutBatchId: v.optional(v.id("affiliatePayoutBatches")),
    payoutRequestId: v.optional(v.id("affiliatePayoutRequests")),
  })
    .index("by_referrerUserId", ["referrerUserId"])
    .index("by_referrerUserId_periodType_periodStart", [
      "referrerUserId",
      "periodType",
      "periodStart",
    ]),

  // Affiliate Payout Batches (manual bookkeeping + Stripe)
  affiliatePayoutBatches: defineTable({
    createdAt: v.number(),
    createdByUserId: v.id("users"),
    method: v.string(),
    notes: v.optional(v.string()),
    totalCommissionCents: v.number(),
    ledgerIds: v.array(v.id("affiliateLedger")),
    status: v.union(v.literal("recorded"), v.literal("voided")),
    voidedAt: v.optional(v.number()),
    // Stripe payout fields
    stripeTransferId: v.optional(v.string()),
    payoutStatus: v.optional(
      v.union(
        v.literal("recorded"),
        v.literal("processing"),
        v.literal("paid"),
        v.literal("failed"),
        v.literal("voided")
      )
    ),
    payoutErrorMessage: v.optional(v.string()),
    paidAt: v.optional(v.number()),
    processingAt: v.optional(v.number()),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_status", ["status"])
    .index("by_createdByUserId_createdAt", ["createdByUserId", "createdAt"]),

  // Affiliate Payout Requests (affiliate-initiated)
  affiliatePayoutRequests: defineTable({
    referrerUserId: v.id("users"),
    status: v.union(
      v.literal("submitted"),
      v.literal("approved"),
      v.literal("denied"),
      v.literal("cancelled"),
      v.literal("completed")
    ),
    ledgerIds: v.array(v.id("affiliateLedger")),
    totalCommissionCents: v.number(),
    totalRevenueCents: v.number(),
    notes: v.optional(v.string()),
    adminNotes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    approvedAt: v.optional(v.number()),
    deniedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    payoutBatchId: v.optional(v.id("affiliatePayoutBatches")),
  })
    .index("by_referrerUserId_createdAt", ["referrerUserId", "createdAt"])
    .index("by_status_createdAt", ["status", "createdAt"])
    .index("by_payoutBatchId", ["payoutBatchId"]),

  proposals: defineTable({
    companyId: v.id("companies"),
    clientRelationshipId: v.optional(v.id("clientRelationships")),
    clientRequestId: v.id("clientRequests"),
    createdByUserId: v.id("users"),
    title: v.string(),
    clientName: v.string(),
    businessName: v.optional(v.string()),
    propertyAddress: v.optional(v.string()),
    serviceFrequency: v.optional(
      v.union(
        v.literal("one_time"),
        v.literal("weekly"),
        v.literal("biweekly"),
        v.literal("monthly"),
        v.literal("quarterly"),
        v.literal("custom")
      )
    ),
    serviceFrequencyNotes: v.optional(v.string()),
    scopeOfWork: v.optional(v.string()),
    monthlyPriceCents: v.optional(v.number()),
    oneTimePriceCents: v.optional(v.number()),
    notes: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("sent"),
      v.literal("accepted"),
      v.literal("declined")
    ),
    sentAt: v.optional(v.number()),
    acceptedAt: v.optional(v.number()),
    declinedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_companyId", ["companyId"])
    .index("by_clientRequestId", ["clientRequestId"])
    .index("by_companyId_status", ["companyId", "status"]),

  walkthroughs: defineTable({
    companyId: v.id("companies"),
    clientRelationshipId: v.optional(v.id("clientRelationships")),
    clientRequestId: v.optional(v.id("clientRequests")),
    propertyId: v.optional(v.id("properties")),
    commercialAccountId: v.optional(v.id("commercialAccounts")),
    proposalId: v.optional(v.id("proposals")),
    title: v.string(),
    walkthroughType: v.union(
      v.literal("commercial"),
      v.literal("residential"),
      v.literal("str"),
      v.literal("move_in_out"),
      v.literal("post_construction"),
      v.literal("inspection"),
      v.literal("custom")
    ),
    status: v.union(
      v.literal("draft"),
      v.literal("completed"),
      v.literal("proposal_created"),
      v.literal("archived")
    ),
    scheduledDate: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    contactName: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    address: v.optional(v.string()),
    squareFootage: v.optional(v.number()),
    bedrooms: v.optional(v.number()),
    bathrooms: v.optional(v.number()),
    serviceFrequencyRecommendation: v.optional(v.string()),
    estimatedHours: v.optional(v.number()),
    recommendedCleanerCount: v.optional(v.number()),
    estimatedMonthlyValueCents: v.optional(v.number()),
    rooms: v.optional(v.array(v.object({
      name: v.string(),
      roomType: v.string(),
      notes: v.optional(v.string()),
      condition: v.optional(v.string()),
      estimatedMinutes: v.optional(v.number()),
    }))),
    scopeNotes: v.optional(v.string()),
    supplyNotes: v.optional(v.string()),
    accessNotes: v.optional(v.string()),
    riskNotes: v.optional(v.string()),
    staffingNotes: v.optional(v.string()),
    proposalNotes: v.optional(v.string()),
    photos: v.optional(v.array(v.object({
      url: v.string(),
      caption: v.optional(v.string()),
      uploadedAt: v.number(),
    }))),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_company", ["companyId"])
    .index("by_clientRequest", ["clientRequestId"])
    .index("by_property", ["propertyId"])
    .index("by_commercialAccount", ["commercialAccountId"])
    .index("by_proposal", ["proposalId"]),

  serviceAgreements: defineTable({
    companyId: v.id("companies"),
    clientRelationshipId: v.optional(v.id("clientRelationships")),
    proposalId: v.id("proposals"),
    clientRequestId: v.optional(v.id("clientRequests")),
    commercialAccountId: v.optional(v.id("commercialAccounts")),
    title: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("sent"),
      v.literal("signed"),
      v.literal("cancelled")
    ),
    agreementType: v.literal("commercial_cleaning"),
    effectiveStartDate: v.optional(v.string()),
    effectiveEndDate: v.optional(v.string()),
    renewalDate: v.optional(v.string()),
    serviceFrequency: v.optional(v.string()),
    contractAmountCents: v.optional(v.number()),
    paymentTerms: v.optional(v.string()),
    scopeOfWork: v.optional(v.string()),
    terms: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    sentAt: v.optional(v.number()),
    signedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
  })
    .index("by_company", ["companyId"])
    .index("by_proposal", ["proposalId"])
    .index("by_clientRequest", ["clientRequestId"])
    .index("by_commercialAccount", ["commercialAccountId"]),

  commercialAccounts: defineTable({
    companyId: v.id("companies"),
    clientRelationshipId: v.optional(v.id("clientRelationships")),
    sourceLeadId: v.optional(v.id("clientRequests")),
    clientRequestId: v.optional(v.id("clientRequests")),
    sourceProposalId: v.optional(v.id("proposals")),
    serviceAgreementId: v.optional(v.id("serviceAgreements")),
    clientName: v.string(),
    contactName: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    serviceAddress: v.optional(v.string()),
    contractAmountCents: v.optional(v.number()),
    serviceFrequency: v.optional(
      v.union(
        v.literal("one_time"),
        v.literal("weekly"),
        v.literal("biweekly"),
        v.literal("monthly"),
        v.literal("quarterly"),
        v.literal("custom")
      )
    ),
    startDate: v.optional(v.string()),
    renewalDate: v.optional(v.string()),
    assignedManagerId: v.optional(v.id("users")),
    assignedCleanerId: v.optional(v.id("users")),
    assignedTeamId: v.optional(v.id("teams")),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("ended")
    ),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_companyId", ["companyId"])
    .index("by_sourceProposalId", ["sourceProposalId"])
    .index("by_clientRequestId", ["clientRequestId"])
    .index("by_companyId_status", ["companyId", "status"]),

  commercialSchedules: defineTable({
    companyId: v.id("companies"),
    commercialAccountId: v.id("commercialAccounts"),
    propertyId: v.optional(v.id("properties")),
    title: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("ended")
    ),
    frequency: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("biweekly"),
      v.literal("monthly"),
      v.literal("custom")
    ),
    daysOfWeek: v.optional(v.array(v.number())),
    dayOfMonth: v.optional(v.number()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    defaultStartTime: v.optional(v.string()),
    defaultDueTime: v.optional(v.string()),
    assignedCleanerId: v.optional(v.id("users")),
    assignedManagerId: v.optional(v.id("users")),
    assignedTeamId: v.optional(v.id("teams")),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_company", ["companyId"])
    .index("by_commercialAccount", ["commercialAccountId"])
    .index("by_property", ["propertyId"]),

  invoices: defineTable({
    companyId: v.id("companies"),
    clientRelationshipId: v.optional(v.id("clientRelationships")),
    commercialAccountId: v.id("commercialAccounts"),
    title: v.string(),
    invoiceNumber: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("issued"),
      v.literal("paid"),
      v.literal("void")
    ),
    billingStartDate: v.string(),
    billingEndDate: v.string(),
    issueDate: v.string(),
    dueDate: v.string(),
    subtotalCents: v.number(),
    taxCents: v.number(),
    totalCents: v.number(),
    jobIds: v.array(v.id("jobs")),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    issuedAt: v.optional(v.number()),
    paidAt: v.optional(v.number()),
    voidedAt: v.optional(v.number()),
  })
    .index("by_company", ["companyId"])
    .index("by_commercialAccount", ["commercialAccountId"])
    .index("by_status", ["status"]),

  clientRequests: defineTable({
    companyId: v.id("companies"),
    clientRelationshipId: v.optional(v.id("clientRelationships")),
    createdAt: v.number(),
    status: v.union(
      v.literal("new"),
      v.literal("accepted"),
      v.literal("declined"),
      v.literal("converted"),
      v.literal("contacted"),
      v.literal("archived")
    ),
    contactedAt: v.optional(v.number()),
    archivedAt: v.optional(v.number()),
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
    requestedService: v.optional(v.string()),
    source: v.union(v.literal("public_link"), v.literal("manual")),
    leadType: v.optional(
      v.union(
        v.literal("booking_request"),
        v.literal("residential"),
        v.literal("str_airbnb"),
        v.literal("commercial"),
        v.literal("move_out"),
        v.literal("post_construction"),
        v.literal("other")
      )
    ),
    propertyId: v.optional(v.id("properties")),
    // Client portal fields
    portalToken: v.optional(v.string()),
    portalEnabled: v.optional(v.boolean()),
    clientNotes: v.optional(v.string()),
    updatedByClientAt: v.optional(v.number()),
    // Lead pipeline (CRM v1)
    leadStage: v.optional(
      v.union(
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
      )
    ),
    leadNotes: v.optional(v.string()),
    nextFollowUpAt: v.optional(v.number()),
    lastStageChangedAt: v.optional(v.number()),
    businessName: v.optional(v.string()),
    businessContactTitle: v.optional(v.string()),
    businessWebsite: v.optional(v.string()),
    estimatedContractValueCents: v.optional(v.number()),
    estimatedFrequency: v.optional(
      v.union(
        v.literal("one_time"),
        v.literal("weekly"),
        v.literal("biweekly"),
        v.literal("monthly"),
        v.literal("quarterly"),
        v.literal("custom")
      )
    ),
    estimatedFrequencyNotes: v.optional(v.string()),
    createdByUserId: v.optional(v.id("users")),
  })
    .index("by_companyId", ["companyId"])
    .index("by_companyId_status", ["companyId", "status"])
    .index("by_portalToken", ["portalToken"]),

  // Manuals Library (v1)
  manuals: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    category: v.union(
      v.literal("cleaner"),
      v.literal("owner"),
      v.literal("app")
    ),
    roleVisibility: v.union(
      v.literal("cleaner"),
      v.literal("owner"),
      v.literal("both")
    ),
    blobKey: v.string(),
    createdAt: v.number(),
  }).index("by_roleVisibility", ["roleVisibility"]),

  // Client Feedback (from portal)
  clientFeedback: defineTable({
    clientRequestId: v.id("clientRequests"),
    createdAt: v.number(),
    rating: v.number(),
    comment: v.optional(v.string()),
    contactName: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    status: v.union(v.literal("new"), v.literal("reviewed")),
    featuredOnSite: v.optional(v.boolean()),
  })
    .index("by_clientRequestId", ["clientRequestId"])
    .index("by_clientRequestId_createdAt", ["clientRequestId", "createdAt"])
    .index("by_status_createdAt", ["status", "createdAt"]),

  // Cleaner Availability (weekly recurring)
  cleanerAvailability: defineTable({
    cleanerId: v.id("users"),
    dayOfWeek: v.number(), // 0=Sunday .. 6=Saturday
    startMinutes: v.number(), // 0-1439
    endMinutes: v.number(), // 0-1439
    enabled: v.boolean(),
  }).index("by_cleanerId_dayOfWeek", ["cleanerId", "dayOfWeek"]),

  // Cleaner Availability Overrides (date-level)
  cleanerAvailabilityOverrides: defineTable({
    cleanerId: v.id("users"),
    date: v.string(), // "YYYY-MM-DD"
    unavailable: v.boolean(),
  }).index("by_cleanerId_date", ["cleanerId", "date"]),

  // Cleaner Payments (owner to cleaner, per-job)
  cleanerPayments: defineTable({
    companyId: v.id("companies"),
    jobId: v.id("jobs"),
    cleanerUserId: v.id("users"),
    amountCents: v.optional(v.number()),
    method: v.optional(v.union(v.literal("in_app"), v.literal("outside_app"))),
    status: v.union(
      v.literal("OPEN"),
      v.literal("PAID"),
      v.literal("CANCELED")
    ),
    createdAt: v.number(),
    paidAt: v.optional(v.number()),
    paidByUserId: v.optional(v.id("users")),
    stripeCheckoutSessionId: v.optional(v.string()),
    stripePaymentIntentId: v.optional(v.string()),
    stripeTransferId: v.optional(v.string()),
  })
    .index("by_jobId", ["jobId"])
    .index("by_companyId", ["companyId"])
    .index("by_cleanerUserId", ["cleanerUserId"]),

  // Cleaner Payment / Job join table (batch support)
  cleanerPaymentJobs: defineTable({
    cleanerPaymentId: v.id("cleanerPayments"),
    jobId: v.id("jobs"),
    amountCents: v.optional(v.number()), // per-job line item amount at time of batch
  })
    .index("by_cleanerPaymentId", ["cleanerPaymentId"])
    .index("by_jobId", ["jobId"]),

  // Owner-to-Owner Settlements (shared job payments)
  companySettlements: defineTable({
    fromCompanyId: v.id("companies"),
    toCompanyId: v.id("companies"),
    originalJobId: v.id("jobs"),
    sharedJobId: v.optional(v.id("sharedJobs")),
    amountCents: v.number(),
    currency: v.string(),
    status: v.union(
      v.literal("open"),
      v.literal("paid"),
      v.literal("void")
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    paidAt: v.optional(v.number()),
    paidByUserId: v.optional(v.id("users")),
    paidMethod: v.optional(v.string()),
    note: v.optional(v.string()),
    // Stripe settlement payment fields
    stripeCheckoutSessionId: v.optional(v.string()),
    stripePaymentIntentId: v.optional(v.string()),
    stripeApplicationFeeCents: v.optional(v.number()),
    stripeDestinationAccountId: v.optional(v.string()),
    stripeReceiptUrl: v.optional(v.string()),
  })
    .index("by_fromCompany_status", ["fromCompanyId", "status"])
    .index("by_toCompany_status", ["toCompanyId", "status"])
    .index("by_originalJobId", ["originalJobId"]),

  // Settlement Batches (batch pay multiple settlements to same partner)
  settlementBatches: defineTable({
    fromCompanyId: v.id("companies"),
    toCompanyId: v.id("companies"),
    totalAmountCents: v.number(),
    currency: v.string(),
    status: v.union(
      v.literal("OPEN"),
      v.literal("PAID"),
      v.literal("CANCELED")
    ),
    createdAt: v.number(),
    paidAt: v.optional(v.number()),
    paidByUserId: v.optional(v.id("users")),
    paidMethod: v.optional(v.string()),
    stripeCheckoutSessionId: v.optional(v.string()),
    stripePaymentIntentId: v.optional(v.string()),
  })
    .index("by_fromCompanyId", ["fromCompanyId"]),

  // Settlement Batch / Settlement join table
  settlementBatchItems: defineTable({
    batchId: v.id("settlementBatches"),
    settlementId: v.id("companySettlements"),
  })
    .index("by_batchId", ["batchId"])
    .index("by_settlementId", ["settlementId"]),

  // Manager Inspections (QA house checks)
  managerInspections: defineTable({
    jobId: v.id("jobs"),
    companyId: v.id("companies"),
    managerId: v.id("users"),
    readinessScore: v.number(), // 1-10
    notes: v.optional(v.string()),
    severity: v.union(
      v.literal("none"),
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical")
    ),
    issues: v.optional(v.array(v.string())),
    photoStorageIds: v.optional(v.array(v.id("_storage"))),
    createdAt: v.number(),
  })
    .index("by_jobId", ["jobId"])
    .index("by_companyId_createdAt", ["companyId", "createdAt"]),

  // Inventory Templates (Sprint 2)
  inventoryTemplates: defineTable({
    companyId: v.id("companies"),
    name: v.string(),
    items: v.array(v.object({
      name: v.string(),
      category: v.string(),
      parLevel: v.number(),
      required: v.boolean(),
      restockResponsibility: v.optional(v.string()),
      notes: v.optional(v.string()),
    })),
    isDefault: v.optional(v.boolean()),
    createdAt: v.number(),
  }).index("by_companyId", ["companyId"]),

  // Rate Limits (server-side sliding window)
  rateLimits: defineTable({
    key: v.string(),
    windowStartMs: v.number(),
    count: v.number(),
  }).index("by_key", ["key"]),

  // Calendar Sync (iCal feed integration)

  calendarConnections: defineTable({
    companyId: v.id("companies"),
    propertyId: v.id("properties"),
    platform: v.union(
      v.literal("airbnb"),
      v.literal("vrbo"),
      v.literal("other")
    ),
    icalUrl: v.string(),
    label: v.optional(v.string()),
    enabled: v.boolean(),
    lastSyncAt: v.optional(v.number()),
    lastSyncStatus: v.union(
      v.literal("success"),
      v.literal("error"),
      v.literal("pending")
    ),
    lastSyncError: v.optional(v.string()),
    // ISO date string - reservations with checkOut <= this date are skipped
    // on first sync to prevent historical job creation
    initialSyncCutoff: v.string(),
    consecutiveErrors: v.number(),
    createdAt: v.number(),
    createdBy: v.id("users"),
  })
    .index("by_companyId", ["companyId"])
    .index("by_propertyId", ["propertyId"])
    .index("by_enabled", ["enabled"]),

  calendarReservations: defineTable({
    companyId: v.id("companies"),
    connectionId: v.id("calendarConnections"),
    propertyId: v.id("properties"),
    externalUid: v.string(),
    summary: v.optional(v.string()),
    checkIn: v.string(),
    checkOut: v.string(),
    dtStamp: v.optional(v.string()),
    rawHash: v.string(),
    status: v.union(v.literal("active"), v.literal("cancelled")),
    linkedJobId: v.optional(v.id("jobs")),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
    cancelledAt: v.optional(v.number()),
    // Flags for owner review (set by sync processor, not auto-acted upon)
    jobCreationSkipped: v.optional(v.boolean()),
    skipReason: v.optional(v.string()),
    dateConflict: v.optional(v.boolean()),
    originalCheckOut: v.optional(v.string()),
    cancellationFlagged: v.optional(v.boolean()),
  })
    .index("by_connectionId", ["connectionId"])
    .index("by_propertyId", ["propertyId"])
    .index("by_externalUid", ["externalUid"])
    .index("by_companyId_status", ["companyId", "status"]),

  calendarSyncLogs: defineTable({
    connectionId: v.id("calendarConnections"),
    companyId: v.id("companies"),
    syncedAt: v.number(),
    status: v.union(v.literal("success"), v.literal("error")),
    eventsFound: v.number(),
    reservationsCreated: v.number(),
    errorMessage: v.optional(v.string()),
  }).index("by_connectionId", ["connectionId"]),

  jobAutomationRules: defineTable({
    companyId: v.id("companies"),
    propertyId: v.id("properties"),
    enabled: v.boolean(),
    jobType: v.string(),
    defaultDurationMinutes: v.number(),
    // Maps to jobs.startTime - the time-of-day the job should begin.
    // System default is "16:00". Empty string means owner wants it blank.
    defaultStartTime: v.optional(v.string()),
  })
    .index("by_companyId", ["companyId"])
    .index("by_propertyId", ["propertyId"]),
});
