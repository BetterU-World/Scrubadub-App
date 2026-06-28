import { internalMutation, mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireOwner, logAudit } from "../lib/helpers";

const workerTypeValidator = v.union(
  v.literal("w2_employee"),
  v.literal("contractor_1099"),
  v.literal("maintenance_contractor"),
  v.literal("vendor")
);

const workerRoleValidator = v.union(
  v.literal("cleaner"),
  v.literal("manager"),
  v.literal("maintenance"),
  v.literal("inspector"),
  v.literal("team_lead")
);

const workerStatusValidator = v.union(
  v.literal("pending"),
  v.literal("active"),
  v.literal("inactive"),
  v.literal("archived")
);

const onboardingStatusValidator = v.union(
  v.literal("not_started"),
  v.literal("in_progress"),
  v.literal("blocked"),
  v.literal("complete"),
  v.literal("waived")
);

const jobEligibilityStatusValidator = v.union(
  v.literal("eligible"),
  v.literal("limited"),
  v.literal("ineligible"),
  v.literal("manual_review")
);

const documentTypeValidator = v.union(
  v.literal("contractor_agreement"),
  v.literal("employee_handbook_ack"),
  v.literal("w9_record"),
  v.literal("insurance_record"),
  v.literal("background_check_record"),
  v.literal("training_record"),
  v.literal("policy_ack"),
  v.literal("other")
);

const documentStatusValidator = v.union(
  v.literal("not_started"),
  v.literal("requested"),
  v.literal("received"),
  v.literal("reviewed"),
  v.literal("expired"),
  v.literal("waived")
);

const payProfileValidator = v.object({
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
});

type ExistingWorkerRole = "cleaner" | "maintenance" | "manager";

function isExistingWorkerRole(role: string): role is ExistingWorkerRole {
  return role === "cleaner" || role === "maintenance" || role === "manager";
}

function defaultWorkerTypeForRole(role: ExistingWorkerRole) {
  if (role === "maintenance") return "maintenance_contractor" as const;
  if (role === "manager") return "w2_employee" as const;
  return "contractor_1099" as const;
}

function defaultEligibilityForStatus(status: string) {
  return status === "active" ? "eligible" as const : "ineligible" as const;
}

function cleanOptionalString(value: string | undefined, max = 4000) {
  const trimmed = value?.trim().slice(0, max);
  return trimmed || undefined;
}

function cleanPayProfile(payProfile: any | undefined) {
  if (!payProfile) return undefined;
  return {
    ...payProfile,
    currency: payProfile.currency?.trim().toLowerCase() || "usd",
    stripeConnectUserFieldSource: payProfile.stripeConnectUserFieldSource ?? "users",
    taxDocsHandledOffPlatform: payProfile.taxDocsHandledOffPlatform ?? true,
    outsideAppPaymentNotes: cleanOptionalString(payProfile.outsideAppPaymentNotes, 1000),
  };
}

async function getExistingProfileForUser(ctx: any, userId: any) {
  return await ctx.db
    .query("workerProfiles")
    .withIndex("by_userId", (q: any) => q.eq("userId", userId))
    .first();
}

async function requireOwnedProfile(ctx: any, owner: any, workerProfileId: any) {
  const profile = await ctx.db.get(workerProfileId);
  if (!profile || profile.companyId !== owner.companyId) {
    throw new Error("Worker profile not found");
  }
  return profile;
}

async function requireCompanyWorkerUser(ctx: any, owner: any, workerUserId: any) {
  const target = await ctx.db.get(workerUserId);
  if (!target || target.companyId !== owner.companyId) {
    throw new Error("Worker user not found");
  }
  if (!isExistingWorkerRole(target.role)) {
    throw new Error("Worker profiles can only be created for cleaners, maintenance workers, and managers");
  }
  return target;
}

async function insertDefaultProfile(ctx: any, user: any, workerType?: any) {
  if (!user.companyId || !isExistingWorkerRole(user.role)) {
    throw new Error("Worker user must be a company cleaner, maintenance worker, or manager");
  }
  const now = Date.now();
  return await ctx.db.insert("workerProfiles", {
    companyId: user.companyId,
    userId: user._id,
    workerType: workerType ?? defaultWorkerTypeForRole(user.role),
    workerStatus: user.status,
    primaryRole: user.role,
    eligibleRoles: [user.role],
    onboardingStatus: "in_progress",
    jobEligibilityStatus: defaultEligibilityForStatus(user.status),
    payProfile: {
      currency: "usd",
      stripeConnectUserFieldSource: "users",
      taxDocsHandledOffPlatform: true,
    },
    createdAt: now,
    updatedAt: now,
  });
}

export const ensureWorkerProfileForUser = internalMutation({
  args: {
    userId: v.id("users"),
    workerType: v.optional(workerTypeValidator),
  },
  handler: async (ctx, args) => {
    const db: any = ctx.db;
    const user = await db.get(args.userId);
    if (!user || !user.companyId || !isExistingWorkerRole(user.role)) return null;

    const existing = await getExistingProfileForUser({ ...ctx, db }, user._id);
    if (existing) return existing._id;

    return await insertDefaultProfile({ ...ctx, db }, user, args.workerType);
  },
});

export const backfillCompanyWorkerProfiles = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const db: any = ctx.db;
    const users = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", owner.companyId))
      .collect();

    let created = 0;
    let skippedExisting = 0;
    let skippedNonWorker = 0;
    for (const user of users) {
      if (!isExistingWorkerRole(user.role)) {
        skippedNonWorker += 1;
        continue;
      }
      const existing = await getExistingProfileForUser({ ...ctx, db }, user._id);
      if (existing) {
        skippedExisting += 1;
        continue;
      }
      await insertDefaultProfile({ ...ctx, db }, user);
      created += 1;
    }

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: "backfill_worker_profiles",
      entityType: "workerProfile",
      entityId: owner.companyId,
      details: JSON.stringify({ created, skippedExisting, skippedNonWorker }),
    });

    return { created, skippedExisting, skippedNonWorker };
  },
});

export const upsertWorkerProfile = mutation({
  args: {
    userId: v.id("users"),
    workerUserId: v.id("users"),
    workerType: v.optional(workerTypeValidator),
    workerStatus: v.optional(workerStatusValidator),
    primaryRole: v.optional(workerRoleValidator),
    eligibleRoles: v.optional(v.array(workerRoleValidator)),
    onboardingStatus: v.optional(onboardingStatusValidator),
    jobEligibilityStatus: v.optional(jobEligibilityStatusValidator),
    payProfile: v.optional(payProfileValidator),
    manualComplianceNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const db: any = ctx.db;
    const target = await requireCompanyWorkerUser({ ...ctx, db }, owner, args.workerUserId);
    const existing = await getExistingProfileForUser({ ...ctx, db }, target._id);
    const now = Date.now();

    if (!existing) {
      const profileId = await db.insert("workerProfiles", {
        companyId: owner.companyId,
        userId: target._id,
        workerType: args.workerType ?? defaultWorkerTypeForRole(target.role),
        workerStatus: args.workerStatus ?? target.status,
        primaryRole: args.primaryRole ?? target.role,
        eligibleRoles: args.eligibleRoles ?? [target.role],
        onboardingStatus: args.onboardingStatus ?? "in_progress",
        jobEligibilityStatus: args.jobEligibilityStatus ?? defaultEligibilityForStatus(target.status),
        payProfile: cleanPayProfile(args.payProfile) ?? {
          currency: "usd",
          stripeConnectUserFieldSource: "users",
          taxDocsHandledOffPlatform: true,
        },
        manualComplianceNotes: cleanOptionalString(args.manualComplianceNotes),
        createdAt: now,
        updatedAt: now,
      });
      return profileId;
    }

    const patch: Record<string, unknown> = { updatedAt: now };
    if (args.workerType !== undefined) patch.workerType = args.workerType;
    if (args.workerStatus !== undefined) patch.workerStatus = args.workerStatus;
    if (args.primaryRole !== undefined) patch.primaryRole = args.primaryRole;
    if (args.eligibleRoles !== undefined) patch.eligibleRoles = args.eligibleRoles;
    if (args.onboardingStatus !== undefined) patch.onboardingStatus = args.onboardingStatus;
    if (args.jobEligibilityStatus !== undefined) patch.jobEligibilityStatus = args.jobEligibilityStatus;
    if (args.payProfile !== undefined) patch.payProfile = cleanPayProfile(args.payProfile);
    if (args.manualComplianceNotes !== undefined) {
      patch.manualComplianceNotes = cleanOptionalString(args.manualComplianceNotes);
    }

    await db.patch(existing._id, patch);
    return existing._id;
  },
});

export const updateWorkerProfile = mutation({
  args: {
    userId: v.id("users"),
    workerProfileId: v.id("workerProfiles"),
    workerType: v.optional(workerTypeValidator),
    primaryRole: v.optional(workerRoleValidator),
    eligibleRoles: v.optional(v.array(workerRoleValidator)),
    onboardingStatus: v.optional(onboardingStatusValidator),
    payProfile: v.optional(payProfileValidator),
    manualComplianceNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const db: any = ctx.db;
    await requireOwnedProfile({ ...ctx, db }, owner, args.workerProfileId);

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.workerType !== undefined) patch.workerType = args.workerType;
    if (args.primaryRole !== undefined) patch.primaryRole = args.primaryRole;
    if (args.eligibleRoles !== undefined) patch.eligibleRoles = args.eligibleRoles;
    if (args.onboardingStatus !== undefined) patch.onboardingStatus = args.onboardingStatus;
    if (args.payProfile !== undefined) patch.payProfile = cleanPayProfile(args.payProfile);
    if (args.manualComplianceNotes !== undefined) {
      patch.manualComplianceNotes = cleanOptionalString(args.manualComplianceNotes);
    }

    await db.patch(args.workerProfileId, patch);
  },
});

export const setWorkerStatus = mutation({
  args: {
    userId: v.id("users"),
    workerProfileId: v.id("workerProfiles"),
    workerStatus: workerStatusValidator,
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const db: any = ctx.db;
    await requireOwnedProfile({ ...ctx, db }, owner, args.workerProfileId);
    await db.patch(args.workerProfileId, {
      workerStatus: args.workerStatus,
      updatedAt: Date.now(),
    });
  },
});

export const updateWorkerEligibility = mutation({
  args: {
    userId: v.id("users"),
    workerProfileId: v.id("workerProfiles"),
    jobEligibilityStatus: jobEligibilityStatusValidator,
    eligibleRoles: v.optional(v.array(workerRoleValidator)),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const db: any = ctx.db;
    await requireOwnedProfile({ ...ctx, db }, owner, args.workerProfileId);
    await db.patch(args.workerProfileId, {
      jobEligibilityStatus: args.jobEligibilityStatus,
      ...(args.eligibleRoles !== undefined ? { eligibleRoles: args.eligibleRoles } : {}),
      updatedAt: Date.now(),
    });
  },
});

export const upsertWorkerDocumentStatus = mutation({
  args: {
    userId: v.id("users"),
    workerProfileId: v.id("workerProfiles"),
    documentType: documentTypeValidator,
    status: documentStatusValidator,
    required: v.optional(v.boolean()),
    handledOffPlatform: v.optional(v.boolean()),
    expiresAt: v.optional(v.number()),
    reviewedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const db: any = ctx.db;
    const profile = await requireOwnedProfile({ ...ctx, db }, owner, args.workerProfileId);
    const now = Date.now();

    const existing = await db
      .query("workerDocuments")
      .withIndex("by_workerProfileId_documentType", (q: any) =>
        q.eq("workerProfileId", args.workerProfileId).eq("documentType", args.documentType)
      )
      .first();

    const patch = {
      companyId: profile.companyId,
      workerProfileId: profile._id,
      userId: profile.userId,
      documentType: args.documentType,
      status: args.status,
      required: args.required ?? existing?.required ?? true,
      handledOffPlatform: args.handledOffPlatform ?? existing?.handledOffPlatform ?? true,
      expiresAt: args.expiresAt,
      reviewedAt: args.reviewedAt ?? (args.status === "reviewed" ? now : existing?.reviewedAt),
      reviewedByUserId: args.status === "reviewed" ? owner._id : existing?.reviewedByUserId,
      notes: cleanOptionalString(args.notes),
      updatedAt: now,
    };

    if (existing) {
      await db.patch(existing._id, patch);
      return existing._id;
    }

    return await db.insert("workerDocuments", {
      ...patch,
      createdAt: now,
    });
  },
});

export const upsertWorkerOnboardingItem = mutation({
  args: {
    userId: v.id("users"),
    workerProfileId: v.id("workerProfiles"),
    itemKey: v.string(),
    title: v.string(),
    status: onboardingStatusValidator,
    required: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const db: any = ctx.db;
    const profile = await requireOwnedProfile({ ...ctx, db }, owner, args.workerProfileId);
    const now = Date.now();
    const itemKey = args.itemKey.trim().slice(0, 120);
    if (!itemKey) throw new Error("Item key is required");
    const title = args.title.trim().slice(0, 200);
    if (!title) throw new Error("Title is required");

    const existing = await db
      .query("workerOnboardingItems")
      .withIndex("by_workerProfileId_itemKey", (q: any) =>
        q.eq("workerProfileId", args.workerProfileId).eq("itemKey", itemKey)
      )
      .first();

    const patch = {
      companyId: profile.companyId,
      workerProfileId: profile._id,
      userId: profile.userId,
      itemKey,
      title,
      status: args.status,
      required: args.required ?? existing?.required ?? true,
      completedAt: args.status === "complete" ? existing?.completedAt ?? now : existing?.completedAt,
      completedByUserId: args.status === "complete" ? owner._id : existing?.completedByUserId,
      notes: cleanOptionalString(args.notes),
      updatedAt: now,
    };

    if (existing) {
      await db.patch(existing._id, patch);
      return existing._id;
    }

    return await db.insert("workerOnboardingItems", {
      ...patch,
      createdAt: now,
    });
  },
});

export const completeWorkerOnboardingItem = mutation({
  args: {
    userId: v.id("users"),
    onboardingItemId: v.id("workerOnboardingItems"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const db: any = ctx.db;
    const item = await db.get(args.onboardingItemId);
    if (!item || item.companyId !== owner.companyId) {
      throw new Error("Onboarding item not found");
    }

    await db.patch(args.onboardingItemId, {
      status: "complete",
      completedAt: item.completedAt ?? Date.now(),
      completedByUserId: owner._id,
      notes: args.notes !== undefined ? cleanOptionalString(args.notes) : item.notes,
      updatedAt: Date.now(),
    });
  },
});
