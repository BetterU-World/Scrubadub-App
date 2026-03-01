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
    // Stripe Connect (company-level Express account)
    stripeConnectAccountId: v.optional(v.string()),
    stripeConnectOnboardedAt: v.optional(v.number()),
    // Company profile defaults (feed microsites via fallback)
    companyDisplayName: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    serviceAreaText: v.optional(v.string()),
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
  })
    .index("by_email", ["email"])
    .index("by_companyId", ["companyId"])
    .index("by_inviteToken", ["inviteToken"])
    .index("by_resetToken", ["resetToken"])
    .index("by_referralCode", ["referralCode"])
    .index("by_referredByCode", ["referredByCode"]),

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
    hasStandaloneTub: v.optional(v.boolean()),
    showerGlassDoorCount: v.optional(v.number()),
    maintenanceNotes: v.optional(v.string()),
    ownerNotes: v.optional(v.string()),
    active: v.boolean(),
  }).index("by_companyId", ["companyId"]),

  jobs: defineTable({
    companyId: v.id("companies"),
    propertyId: v.optional(v.id("properties")),
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
    })),
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
      v.literal("shared_job_rejected"),
      v.literal("new_client_request")
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

  // ── Owner Mini Sites (v1) ────────────────────────────────────────

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

  // ── Cleaner Leads (v1) ──────────────────────────────────────────────

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

  // ── Client Portal (Phase 1) ───────────────────────────────────────

  // ── Affiliate Attribution (revenue tracking) ────────────────────
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

  // ── Affiliate Ledger (payout-ready foundation) ─────────────────
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

  // ── Affiliate Payout Batches (manual bookkeeping + Stripe) ──────
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

  // ── Affiliate Payout Requests (affiliate-initiated) ──────────
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

  clientRequests: defineTable({
    companyId: v.id("companies"),
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
    source: v.literal("public_link"),
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
        v.literal("quoted"),
        v.literal("won"),
        v.literal("lost")
      )
    ),
    leadNotes: v.optional(v.string()),
    nextFollowUpAt: v.optional(v.number()),
    lastStageChangedAt: v.optional(v.number()),
  })
    .index("by_companyId", ["companyId"])
    .index("by_companyId_status", ["companyId", "status"])
    .index("by_portalToken", ["portalToken"]),

  // ── Manuals Library (v1) ────────────────────────────────────────
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

  // ── Client Feedback (from portal) ────────────────────────────────
  clientFeedback: defineTable({
    clientRequestId: v.id("clientRequests"),
    createdAt: v.number(),
    rating: v.number(),
    comment: v.optional(v.string()),
    contactName: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    status: v.union(v.literal("new"), v.literal("reviewed")),
  })
    .index("by_clientRequestId_createdAt", ["clientRequestId", "createdAt"])
    .index("by_status_createdAt", ["status", "createdAt"]),

  // ── Cleaner Availability (weekly recurring) ──────────────────────
  cleanerAvailability: defineTable({
    cleanerId: v.id("users"),
    dayOfWeek: v.number(), // 0=Sunday .. 6=Saturday
    startMinutes: v.number(), // 0-1439
    endMinutes: v.number(), // 0-1439
    enabled: v.boolean(),
  }).index("by_cleanerId_dayOfWeek", ["cleanerId", "dayOfWeek"]),

  // ── Cleaner Availability Overrides (date-level) ──────────────────
  cleanerAvailabilityOverrides: defineTable({
    cleanerId: v.id("users"),
    date: v.string(), // "YYYY-MM-DD"
    unavailable: v.boolean(),
  }).index("by_cleanerId_date", ["cleanerId", "date"]),

  // ── Owner↔Owner Settlements (shared job payments) ──────────────────
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
});
