import { internalMutation, mutation } from "../_generated/server";
import { areExternalSideEffectsDisabled } from "../lib/environment";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";
import { MutationCtx } from "../_generated/server";
import { logAudit } from "../lib/helpers";
import { requireOwnerSession } from "../lib/sessionAuth";
import { resolvePropertyConditionRequirement } from "../lib/propertyConditionRequirements";
import { CALENDAR_SYNC_COOLDOWN_MS, CALENDAR_SYNC_LEASE_MS, cancelPendingCalendarSync } from "../lib/calendarSyncAdmission";
import { calendarEventMetadata, classifyICalEvent } from "../lib/calendarClassification";
import { IDENTITY_SCAN_LIMIT, identityReviewFor, validStayDate } from "../lib/calendarReconciliation";

/** Sync interval: connections are eligible for sync after this many ms. */
const SYNC_INTERVAL_MS = 60 * 60 * 1000; // 60 minutes

/** Stagger delay between scheduling sync actions to avoid burst. */
const STAGGER_MS = 2_000; // 2 seconds
const MAX_CONSECUTIVE_ERRORS = 3;
// Shorter than the cron period. A queued lease is valid until ten minutes after
// its planned start; a one-time running claim gets ten minutes to finish.

function hasActiveAttempt(connection: Doc<"calendarConnections">, now: number) {
  return connection.syncAttempt !== undefined &&
    now - connection.syncAttempt.chargedAt < CALENDAR_SYNC_LEASE_MS;
}

function isCurrentAttempt(connection: Doc<"calendarConnections">, attemptId: string) {
  return connection.enabled && connection.syncAttempt?.id === attemptId &&
    connection.syncAttempt.phase !== "pending" &&
    hasActiveAttempt(connection, Date.now());
}

// Also used by cron/admission when an action dies before it can record its error.
async function suspendConnection(ctx: MutationCtx, connection: Doc<"calendarConnections">) {
  await cancelPendingCalendarSync(ctx, connection);
  await ctx.db.patch(connection._id, {
    enabled: false,
    lastSyncStatus: "error",
    lastSyncError: connection.lastSyncError ?? "Synchronization repeatedly did not complete. Check the feed and re-enable the connection to retry.",
    syncAttempt: undefined,
  });
}

/** Shared atomic admission for queued and legacy/direct work. */
async function admissionStatus(ctx: MutationCtx, connection: Doc<"calendarConnections">, now: number) {
  if (hasActiveAttempt(connection, now)) return "busy" as const;
  if (connection.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
    await suspendConnection(ctx, connection);
    return "suspended" as const;
  }
  if ((connection.syncCooldownUntil ?? 0) > now) return "cooldown" as const;
  await cancelPendingCalendarSync(ctx, connection);
  return null;
}

async function scheduleSync(ctx: MutationCtx, connection: Doc<"calendarConnections">, delayMs: number) {
  const now = Date.now();
  const rejected = await admissionStatus(ctx, connection, now);
  if (rejected) return rejected;
  const attemptId = crypto.randomUUID();
  // Scheduling and reservation commit together: neither survives a rollback.
  const scheduledFunctionId = await ctx.scheduler.runAfter(delayMs, internal.actions.calendarSync.syncConnection, {
    connectionId: connection._id, attemptId,
  });
  await ctx.db.patch(connection._id, {
    consecutiveErrors: connection.consecutiveErrors + 1,
    lastSyncStatus: "pending", lastSyncError: undefined,
    syncAttempt: { id: attemptId, chargedAt: now + delayMs, phase: "pending", scheduledFunctionId },
    syncCooldownUntil: now + delayMs + CALENDAR_SYNC_COOLDOWN_MS,
  });
  return "scheduled" as const;
}

/** Claim a queued lease exactly once, or atomically admit an older/direct action.
 * Replayed or expired scheduled tokens cannot reserve a new generation.
 */
export const beginSyncAttempt = internalMutation({
  args: { connectionId: v.id("calendarConnections"), attemptId: v.string(), scheduled: v.optional(v.boolean()) },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection?.enabled) return null;
    const now = Date.now();
    if (args.scheduled) {
      const lease = connection.syncAttempt;
      if (!lease || lease.id !== args.attemptId || lease.phase !== "pending" ||
          lease.chargedAt > now || !hasActiveAttempt(connection, now)) return null;
      await ctx.db.patch(connection._id, {
        syncAttempt: { ...lease, phase: "running", chargedAt: now },
      });
      return connection.icalUrl;
    }
    if (await admissionStatus(ctx, connection, now)) return null;
    await ctx.db.patch(connection._id, {
      consecutiveErrors: connection.consecutiveErrors + 1,
      lastSyncStatus: "pending",
      lastSyncError: undefined,
      syncAttempt: { id: args.attemptId, chargedAt: now, phase: "running" },
      syncCooldownUntil: now + CALENDAR_SYNC_COOLDOWN_MS,
    });
    // Read the URL in the same transaction as admission, not before an owner edit.
    return connection.icalUrl;
  },
});

/** Valid job types from the jobs schema. */
const VALID_JOB_TYPES = new Set([
  "standard", "deep_clean", "turnover", "move_in_out", "maintenance", "post_construction",
]);
type JobType = "standard" | "deep_clean" | "turnover" | "move_in_out" | "maintenance" | "post_construction";

/**
 * Cron tick — called every 15 minutes by the cron scheduler.
 * Picks enabled connections due for sync and schedules actions for each.
 */
export const cronTick = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (areExternalSideEffectsDisabled()) return;
    const connections = await ctx.db
      .query("calendarConnections")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();

    const now = Date.now();
    let scheduled = 0;

    for (const connection of connections) {
      if (hasActiveAttempt(connection, now)) continue;
      if (connection.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        await suspendConnection(ctx, connection);
        continue;
      }
      // Empty feeds are healthy checks, but not authoritative reconciliations.
      // Old rows have no lastCheckedAt and retain their previous scheduling.
      const lastCheck = Math.max(connection.lastSyncAt ?? 0, connection.lastCheckedAt ?? 0);
      if (lastCheck && now - lastCheck < SYNC_INTERVAL_MS) {
        continue;
      }

      // Stagger each sync action to avoid burst
      if (await scheduleSync(ctx, connection, scheduled * STAGGER_MS) === "scheduled") scheduled++;
    }

    if (scheduled > 0) {
      console.log(`[calendarSync] Cron tick: scheduled ${scheduled} connection syncs`);
    }
  },
});

/** Refresh bounded identity evidence before any path can create new work. */
async function refreshIdentityReview(
  ctx: MutationCtx, reservation: Doc<"calendarReservations">,
  actorId: Id<"users">,
  propertyRows?: Doc<"calendarReservations">[],
): Promise<Doc<"calendarReservations">> {
  const rows = propertyRows ?? await ctx.db.query("calendarReservations")
    .withIndex("by_propertyId", q => q.eq("propertyId", reservation.propertyId)).take(IDENTITY_SCAN_LIMIT + 1);
  const review = identityReviewFor(reservation, rows.slice(0, IDENTITY_SCAN_LIMIT), rows.length > IDENTITY_SCAN_LIMIT, Date.now());
  if (!review || review.fingerprint === reservation.identityReview?.fingerprint) return reservation;
  await ctx.db.patch(reservation._id, { identityReview: review });
  await logAudit(ctx, { companyId: reservation.companyId, userId: actorId, action: "calendar_identity_review_required",
    entityType: "calendarReservation", entityId: reservation._id,
    details: JSON.stringify({ revision: review.revision, candidateIds: review.candidateIds, reasons: review.reasons, incomplete: review.incomplete }) });
  return { ...reservation, identityReview: review };
}

/** Create new work only; existing linked jobs are never changed here. */
async function maybeCreateJobForReservation(
  ctx: MutationCtx,
  reservationId: Id<"calendarReservations">,
  reservation: Doc<"calendarReservations">,
  connection: Doc<"calendarConnections">,
  actorId: Id<"users"> = connection.createdBy,
): Promise<Id<"jobs"> | null> {
  // ── Gate 1: reservation already has a linked job ──────────────────
  if (reservation.linkedJobId) return null;

  // The new owner-confirmation path must honor the cutoff even on legacy rows
  // whose old skip flags are absent. Existing linked work remains untouched.
  if (reservation.checkOut <= connection.initialSyncCutoff) {
    await ctx.db.patch(reservationId, { jobCreationSkipped: true, skipReason: "before_initial_sync_cutoff" });
    return null;
  }

  // ── Gate 2: reservation was permanently flagged to skip ────────────
  //   Some skip reasons are permanent (historical cutoff, past checkout).
  //   Others are temporary (rules were disabled, duplicate job existed)
  //   and should be re-evaluated on each sync.
  const PERMANENT_SKIP_REASONS = new Set([
    "before_initial_sync_cutoff",
    "checkout_in_past",
  ]);
  if (
    reservation.jobCreationSkipped &&
    PERMANENT_SKIP_REASONS.has(reservation.skipReason ?? "")
  ) {
    return null;
  }

  const classification = reservation.classification;
  const currentFeed = !!reservation.eventVersion && reservation.eventVersion.startsWith(`${connection.feedRevision ?? 0}:`);
  const confirmedGuest = !!reservation.eventVersion && classification?.source === "owner" &&
    classification.kind === "guest_reservation" && classification.ownerDecision?.kind === "guest_reservation" &&
    classification.ownerDecision.eventVersion === reservation.eventVersion;
  const deniedReason = reservation.status !== "active" ? "reservation_cancelled"
    : reservation.missing ? "reservation_missing"
    : !connection.enabled ? "connection_disabled"
    : !currentFeed ? "feed_source_changed"
    : reservation.identityReview?.state === "duplicate" ? "duplicate_identity"
    : reservation.identityReview?.state === "pending" ? "identity_review_required"
    : reservation.dateReview?.state === "pending" ? "date_review_required"
    : !confirmedGuest
      ? classification?.kind === "non_guest_block" ? "non_guest_block" : "classification_required" : null;
  if (deniedReason) {
    await ctx.db.patch(reservationId, { jobCreationSkipped: true, skipReason: deniedReason });
    return null;
  }

  // ── Gate 3: checkout is in the past (strictly before today) ───────
  //   Same-day checkouts are allowed — the job is for today.
  const today = new Date().toISOString().slice(0, 10);
  if (reservation.checkOut < today) {
    await ctx.db.patch(reservationId, {
      jobCreationSkipped: true,
      skipReason: "checkout_in_past",
    });
    return null;
  }

  // ── Gate 4: automation rules exist and are enabled ────────────────
  const rule = await ctx.db
    .query("jobAutomationRules")
    .withIndex("by_propertyId", (q) =>
      q.eq("propertyId", reservation.propertyId)
    )
    .first();

  if (!rule || !rule.enabled) {
    await ctx.db.patch(reservationId, {
      jobCreationSkipped: true,
      skipReason: "automation_rules_disabled",
    });
    return null;
  }

  // ── Gate 5: no existing non-cancelled calendar-sync job for this
  //   property + scheduledDate (duplicate prevention) ────────────────
  const existingJobs = await ctx.db
    .query("jobs")
    .withIndex("by_propertyId", (q) =>
      q.eq("propertyId", reservation.propertyId)
    )
    .filter((q) =>
      q.and(
        q.eq(q.field("scheduledDate"), reservation.checkOut),
        q.eq(q.field("source"), "calendar_sync"),
        q.neq(q.field("status"), "cancelled")
      )
    )
    .first();

  if (existingJobs) {
    await ctx.db.patch(reservationId, {
      jobCreationSkipped: true,
      skipReason: "duplicate_checkout_date",
    });
    return null;
  }

  // ── Resolve job fields from automation rules ──────────────────────

  // Validate job type — fall back to "turnover" if rule has an invalid value
  const jobType: JobType = VALID_JOB_TYPES.has(rule.jobType)
    ? (rule.jobType as JobType)
    : "turnover";

  // Resolve startTime from rules:
  //   undefined (not set) → system default "16:00"
  //   "" (empty string)   → no startTime on the job
  //   "HH:MM"             → use that value
  let startTime: string | undefined;
  if (rule.defaultStartTime === undefined) {
    startTime = "16:00";
  } else if (rule.defaultStartTime === "") {
    startTime = undefined;
  } else {
    startTime = rule.defaultStartTime;
  }

  const durationMinutes = rule.defaultDurationMinutes ?? 180;

  // ── Create the job ────────────────────────────────────────────────

  const property = await ctx.db.get(reservation.propertyId);
  const propertyName = property?.name ?? "a property";
  const requiresPropertyConditionCheck = await resolvePropertyConditionRequirement(ctx, {
    companyId: reservation.companyId,
    propertyId: reservation.propertyId,
  });

  const jobId = await ctx.db.insert("jobs", {
    companyId: reservation.companyId,
    clientRelationshipId: property?.clientRelationshipId,
    propertyId: reservation.propertyId,
    cleanerIds: [],
    type: jobType,
    status: "scheduled",
    scheduledDate: reservation.checkOut,
    startTime,
    durationMinutes,
    notes: `Auto-created from ${connection.platform} calendar sync`,
    requireConfirmation: true,
    reworkCount: 0,
    // Calendar sync source metadata
    source: "calendar_sync",
    sourceConnectionId: connection._id,
    sourcePlatform: connection.platform,
    sourceReservationId: reservationId,
    requiresPropertyConditionCheck,
  });

  // ── Link reservation back to job and clear any temporary skip flags ─
  await ctx.db.patch(reservationId, {
    linkedJobId: jobId,
    jobCreationSkipped: undefined,
    skipReason: undefined,
  });

  // ── Audit log ─────────────────────────────────────────────────────
  await ctx.db.insert("auditLog", {
    companyId: reservation.companyId,
    userId: actorId,
    action: "calendar_sync_create_job",
    entityType: "job",
    entityId: jobId,
    details: `Auto-created from ${connection.platform} reservation ${reservation.externalUid} for ${propertyName} on ${reservation.checkOut}`,
    timestamp: Date.now(),
  });

  // ── Notify the owner ──────────────────────────────────────────────
  // Find the company owner(s) to notify
  const owners = await ctx.db
    .query("users")
    .withIndex("by_companyId", (q) =>
      q.eq("companyId", reservation.companyId)
    )
    .filter((q) =>
      q.and(
        q.eq(q.field("role"), "owner"),
        q.eq(q.field("status"), "active")
      )
    )
    .collect();

  for (const owner of owners) {
    await ctx.db.insert("notifications", {
      companyId: reservation.companyId,
      userId: owner._id,
      type: "calendar_sync_alert",
      title: "New Turnover Job Created",
      message: `A cleaning job for ${propertyName} on ${reservation.checkOut} was auto-created from ${connection.platform}. Please assign a cleaner.`,
      read: false,
      relatedJobId: jobId,
    });
  }

  return jobId;
}

/**
 * Process parsed iCal sync results for a single connection.
 *
 * Responsibilities:
 *   - Create or update calendarReservations
 *   - Auto-create unassigned jobs for eligible reservations
 *   - Record explicit cancellations and review-only missing observations
 *   - Update connection sync status
 *   - Write sync log entry
 */
export const processSyncResults = internalMutation({
  args: {
    connectionId: v.id("calendarConnections"),
    attemptId: v.string(),
    // Optional at the wire boundary so old in-flight actions fail safely in the
    // handler; unvalidated results must never become authoritative snapshots.
    snapshotStatus: v.optional(v.union(v.literal("valid"), v.literal("valid_empty"), v.literal("invalid"), v.literal("degraded"))),
    cancelledUids: v.optional(v.array(v.string())),
    reservations: v.array(
      v.object({
        uid: v.string(),
        summary: v.optional(v.string()),
        checkIn: v.string(),
        checkOut: v.string(),
        dtStamp: v.optional(v.string()),
        rawHash: v.string(),
        classificationHash: v.optional(v.string()),
        eventMetadata: v.optional(calendarEventMetadata),
      })
    ),
    totalEvents: v.number(),
    skipped: v.number(),
  },
  returns: v.union(v.literal("success"), v.literal("empty"), v.literal("skipped")),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    // A disabled/deleted connection, owner recovery, expired round or newer
    // attempt cancels this result. Never persist or cancel reservations for it.
    if (!connection || !isCurrentAttempt(connection, args.attemptId)) return "skipped" as const;
    const property = await ctx.db.get(connection.propertyId);
    if (!property || property.companyId !== connection.companyId) throw new Error("Calendar property is unavailable");

    if (args.snapshotStatus === "valid_empty") {
      if (args.totalEvents !== 0 || args.skipped !== 0 || args.reservations.length !== 0 ||
          (args.cancelledUids ?? []).length !== 0) {
        throw new Error("Inconsistent empty iCalendar snapshot");
      }
      const now = Date.now();
      // A valid empty feed breaks the failure streak without proving absence.
      // Leave lastSyncAt, all reservations and all jobs completely untouched.
      await ctx.db.patch(connection._id, {
        lastCheckedAt: now,
        lastSyncStatus: "empty",
        lastSyncError: undefined,
        consecutiveErrors: 0,
        syncAttempt: undefined,
        syncCooldownUntil: now + CALENDAR_SYNC_COOLDOWN_MS,
      });
      await ctx.db.insert("calendarSyncLogs", {
        connectionId: connection._id, companyId: connection.companyId,
        syncedAt: now, status: "empty", eventsFound: 0, reservationsCreated: 0,
      });
      return "empty" as const;
    }

    const cancelledUids = new Set(args.cancelledUids ?? []);
    const reservationUids = new Set(args.reservations.map((r) => r.uid));
    if (args.snapshotStatus !== "valid" || args.skipped !== 0 ||
        args.reservations.length + cancelledUids.size === 0 ||
        reservationUids.size !== args.reservations.length ||
        cancelledUids.size !== (args.cancelledUids ?? []).length ||
        args.totalEvents !== args.reservations.length + cancelledUids.size ||
        [...cancelledUids].some((uid) => !uid.trim() || reservationUids.has(uid)) ||
        args.reservations.some((r) => !r.uid.trim() || !validStayDate(r.checkIn) || !validStayDate(r.checkOut) || r.checkOut <= r.checkIn)) {
      throw new Error("Unsafe or unvalidated iCalendar snapshot");
    }

    const now = Date.now();
    let reservationsCreated = 0;
    let reservationsUpdated = 0;
    let reservationsCancelled = 0;
    let reservationsMissing = 0;
    let jobsCreated = 0;
    const observedIds: Id<"calendarReservations">[] = [];

    // Build a set of UIDs present in this sync for cancellation detection
    const incomingUids = new Set(args.reservations.map((r) => r.uid));

    // ── Process each incoming reservation ──────────────────────────────

    for (const res of args.reservations) {
      const eventVersion = `${connection.feedRevision ?? 0}:${res.rawHash}:${res.classificationHash ?? "legacy"}`;
      // Look up existing reservation by externalUid + connectionId
      const existing = await ctx.db
        .query("calendarReservations")
        .withIndex("by_connectionId_externalUid", (q) =>
          q.eq("connectionId", args.connectionId).eq("externalUid", res.uid)
        )
        .unique();

      if (!existing) {
        // ── New reservation ────────────────────────────────────────────
        const beforeCutoff = res.checkOut <= connection.initialSyncCutoff;

        const reservationId = await ctx.db.insert("calendarReservations", {
          companyId: connection.companyId,
          connectionId: args.connectionId,
          propertyId: connection.propertyId,
          externalUid: res.uid,
          summary: res.summary,
          checkIn: res.checkIn,
          checkOut: res.checkOut,
          dtStamp: res.dtStamp,
          rawHash: res.rawHash,
          eventVersion,
          eventMetadata: res.eventMetadata,
          classification: { ...classifyICalEvent({ platform: connection.platform, summary: res.summary, ...res.eventMetadata }), classifiedAt: now, revision: 1 },
          status: "active",
          firstSeenAt: now,
          lastSeenAt: now,
          ...(beforeCutoff
            ? {
                jobCreationSkipped: true,
                skipReason: "before_initial_sync_cutoff",
              }
            : {}),
        });
        reservationsCreated++;
        observedIds.push(reservationId);
      } else {
        // ── Existing reservation ───────────────────────────────────────
        if (existing.companyId !== connection.companyId || existing.propertyId !== connection.propertyId) throw new Error("Calendar reservation scope mismatch");

        const updates: Record<string, unknown> = { lastSeenAt: now, eventVersion, eventMetadata: res.eventMetadata };
        observedIds.push(existing._id);
        const datesChanged = existing.checkIn !== res.checkIn || existing.checkOut !== res.checkOut;
        const materialChanged = datesChanged || (existing.eventVersion !== undefined
          ? existing.eventVersion !== eventVersion : existing.rawHash !== res.rawHash);
        // Unchanged legacy rows remain unconfirmed without mass review episodes.
        // Every job path nevertheless requires current, explicit guest approval.
        if (materialChanged) {
          updates.classification = {
            ...classifyICalEvent({ platform: connection.platform, summary: res.summary, ...res.eventMetadata }),
            reason: "material_event_changed", classifiedAt: now,
            revision: (existing.classification?.revision ?? 0) + 1,
            ...(existing.classification?.ownerDecision ? { ownerDecision: existing.classification.ownerDecision } : {}),
          };
          await logAudit(ctx, {
            companyId: connection.companyId, userId: connection.createdBy,
            action: "calendar_classification_review_required", entityType: "calendarReservation", entityId: existing._id,
            details: JSON.stringify({ previousKind: existing.classification?.kind ?? "legacy_unconfirmed", eventVersion }),
          });
        }
        if (existing.missing) {
          updates.missing = undefined;
          await logAudit(ctx, {
            companyId: connection.companyId, userId: connection.createdBy,
            action: "calendar_reservation_missing_resolved", entityType: "calendarReservation", entityId: existing._id,
            details: JSON.stringify({ ...existing.missing, resolution: "reappeared" }),
          });
        }

        // If reservation was previously cancelled but reappeared, reactivate
        if (existing.status === "cancelled") {
          updates.status = "active";
          updates.cancelledAt = undefined;
          updates.cancellationFlagged = undefined;
          updates.cancellationEvidence = undefined;
          await logAudit(ctx, {
            companyId: connection.companyId, userId: connection.createdBy,
            action: "calendar_reservation_reactivated", entityType: "calendarReservation", entityId: existing._id,
            details: JSON.stringify({ previousCancellationEvidence: existing.cancellationEvidence }),
          });
        }

        // If hash changed, dates or summary changed — update fields
        if (datesChanged) {
          const previous = existing.dateReview?.state === "pending" ? existing.dateReview : undefined;
          updates.dateReview = { revision: (existing.dateReview?.revision ?? 0) + 1, eventVersion, state: "pending",
            previousCheckIn: previous?.previousCheckIn ?? existing.checkIn, previousCheckOut: previous?.previousCheckOut ?? existing.checkOut,
            proposedCheckIn: res.checkIn, proposedCheckOut: res.checkOut, observedAt: now };
          await logAudit(ctx, { companyId: connection.companyId, userId: connection.createdBy,
            action: "calendar_reservation_dates_changed", entityType: "calendarReservation", entityId: existing._id,
            details: JSON.stringify({ previousCheckIn: existing.checkIn, previousCheckOut: existing.checkOut,
              proposedCheckIn: res.checkIn, proposedCheckOut: res.checkOut, eventVersion, linkedJobId: existing.linkedJobId }) });
        } else if (materialChanged && existing.dateReview?.state === "pending") {
          updates.dateReview = { ...existing.dateReview, revision: existing.dateReview.revision + 1, eventVersion };
        }
        if (existing.rawHash !== res.rawHash || datesChanged) {
          // Track if checkout date specifically changed (for future flagging)
          if (existing.checkOut !== res.checkOut && existing.linkedJobId) {
            updates.dateConflict = true;
            updates.originalCheckOut = existing.originalCheckOut ?? existing.checkOut;
          }

          updates.checkIn = res.checkIn;
          updates.checkOut = res.checkOut;
          updates.summary = res.summary;
          updates.dtStamp = res.dtStamp;
          updates.rawHash = res.rawHash;
          reservationsUpdated++;
        }

        await ctx.db.patch(existing._id, updates);
      }
    }

    // Only explicit provider cancellation evidence may cancel a reservation.
    // Include already-cancelled rows so a legacy cancellation can gain actual
    // evidence when observed, without inferring or repairing historical state.
    for (const uid of cancelledUids) {
      const existing = await ctx.db.query("calendarReservations")
        .withIndex("by_connectionId_externalUid", (q) => q.eq("connectionId", args.connectionId).eq("externalUid", uid))
        .unique();
      if (!existing || (existing.status === "cancelled" && existing.cancellationEvidence)) continue;
      if (existing.companyId !== connection.companyId || existing.propertyId !== connection.propertyId) throw new Error("Calendar reservation scope mismatch");
      await ctx.db.patch(existing._id, {
        status: "cancelled", cancelledAt: existing.status === "cancelled" ? (existing.cancelledAt ?? now) : now, missing: undefined,
        cancellationFlagged: existing.linkedJobId ? true : undefined,
        cancellationEvidence: { source: "ical_status_cancelled", observedAt: now, attemptId: args.attemptId },
      });
      await logAudit(ctx, {
        companyId: connection.companyId, userId: connection.createdBy,
        action: "calendar_reservation_explicitly_cancelled", entityType: "calendarReservation", entityId: existing._id,
        details: JSON.stringify({ source: "ical_status_cancelled", attemptId: args.attemptId, missingEpisode: existing.missing }),
      });
      reservationsCancelled++;
    }

    // Absence is an observation requiring review, never confirmation of a
    // cancellation. The attempt fence makes each committed observation unique.

    const allExisting = await ctx.db
      .query("calendarReservations")
      .withIndex("by_connectionId", (q) =>
        q.eq("connectionId", args.connectionId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    for (const existing of allExisting) {
      if (existing.companyId !== connection.companyId || existing.propertyId !== connection.propertyId) throw new Error("Calendar reservation scope mismatch");
      if (!incomingUids.has(existing.externalUid)) {
        const missing = existing.missing
          ? { ...existing.missing, lastMissingAt: now, observations: existing.missing.observations + 1 }
          : { episodeId: args.attemptId, firstMissingAt: now, lastMissingAt: now, observations: 1 };
        await ctx.db.patch(existing._id, { missing });
        if (!existing.missing) {
          await logAudit(ctx, {
            companyId: connection.companyId, userId: connection.createdBy,
            action: "calendar_reservation_missing", entityType: "calendarReservation", entityId: existing._id,
            details: JSON.stringify({ ...missing, lastSeenAt: existing.lastSeenAt,
              checkIn: existing.checkIn, checkOut: existing.checkOut, connectionId: existing.connectionId, propertyId: existing.propertyId }),
          });
        }
        reservationsMissing++;
      }
    }

    // Reconcile only after all observations, cancellations and missing evidence
    // are visible. A single bounded property scan also catches same-snapshot
    // collisions, independently of event order, before any job creation.
    const propertyRows = await ctx.db.query("calendarReservations")
      .withIndex("by_propertyId", q => q.eq("propertyId", connection.propertyId)).take(IDENTITY_SCAN_LIMIT + 1);
    for (const id of observedIds) {
      const row = await ctx.db.get(id);
      if (!row) continue;
      const reviewed = await refreshIdentityReview(ctx, row, connection.createdBy, propertyRows);
      const jobId = await maybeCreateJobForReservation(ctx, id, reviewed, connection);
      if (jobId) jobsCreated++;
    }

    // ── Update connection status ───────────────────────────────────────

    await ctx.db.patch(args.connectionId, {
      lastSyncAt: now,
      lastCheckedAt: now,
      lastSyncStatus: "success" as const,
      lastSyncError: undefined,
      consecutiveErrors: 0,
      syncAttempt: undefined,
      syncCooldownUntil: now + CALENDAR_SYNC_COOLDOWN_MS,
    });

    // ── Write sync log ─────────────────────────────────────────────────

    await ctx.db.insert("calendarSyncLogs", {
      connectionId: args.connectionId,
      companyId: connection.companyId,
      syncedAt: now,
      status: "success",
      eventsFound: args.totalEvents,
      reservationsCreated,
      reservationsMissing,
      reservationsCancelled,
      errorMessage: undefined,
    });

    console.log(
      `[calendarSync] Connection ${args.connectionId}: ` +
        `${args.totalEvents} events, ${reservationsCreated} new, ` +
        `${reservationsUpdated} updated, ${reservationsCancelled} explicitly cancelled, ${reservationsMissing} missing, ` +
        `${jobsCreated} jobs created, ${args.skipped} skipped`
    );
    return "success" as const;
  },
});

/** A version-bound owner decision is the only positive classification source. */
export const confirmEventClassification = mutation({
  args: {
    sessionToken: v.string(), userId: v.optional(v.id("users")),
    reservationId: v.id("calendarReservations"),
    kind: v.union(v.literal("guest_reservation"), v.literal("non_guest_block")),
    expectedEventVersion: v.string(), expectedRevision: v.number(), expectedFeedRevision: v.number(),
    expectedMissingEpisode: v.optional(v.string()),
  },
  returns: v.object({
    outcome: v.union(v.literal("created"), v.literal("already_linked"), v.literal("not_eligible")),
    linkedJobId: v.optional(v.id("jobs")), skipReason: v.optional(v.string()), manualJobReviewRequired: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    const reservation = await ctx.db.get(args.reservationId);
    if (!reservation || reservation.companyId !== owner.companyId) throw new Error("Reservation not found");
    const connection = await ctx.db.get(reservation.connectionId);
    const property = await ctx.db.get(reservation.propertyId);
    if (!connection || connection.companyId !== owner.companyId || connection.propertyId !== reservation.propertyId ||
        !property || property.companyId !== owner.companyId) throw new Error("Calendar source or property is unavailable");
    if (!reservation.eventVersion || reservation.eventVersion !== args.expectedEventVersion ||
        (reservation.classification?.revision ?? 0) !== args.expectedRevision ||
        (connection.feedRevision ?? 0) !== args.expectedFeedRevision ||
        !reservation.eventVersion.startsWith(`${connection.feedRevision ?? 0}:`) ||
        reservation.missing?.episodeId !== args.expectedMissingEpisode || reservation.status !== "active") {
      throw new Error("Event or review state changed. Sync or refresh and review again.");
    }
    const previous = reservation.classification;
    const sameDecision = previous?.source === "owner" && previous.kind === args.kind &&
      previous.ownerDecision?.eventVersion === reservation.eventVersion;
    if (!sameDecision) {
      const revision = (previous?.revision ?? 0) + 1;
      const now = Date.now();
      await ctx.db.patch(reservation._id, { classification: {
        kind: args.kind, source: "owner", reason: "owner_confirmed", classifiedAt: now, revision,
        ownerDecision: { kind: args.kind, actorId: owner._id, confirmedAt: now, eventVersion: reservation.eventVersion },
      } });
      await logAudit(ctx, {
        companyId: owner.companyId, userId: owner._id,
        action: "calendar_event_classified", entityType: "calendarReservation", entityId: reservation._id,
        details: JSON.stringify({ kind: args.kind, previousKind: previous?.kind ?? "legacy_unconfirmed", revision, eventVersion: reservation.eventVersion }),
      });
    }
    const updated = await refreshIdentityReview(ctx, (await ctx.db.get(reservation._id))!, owner._id);
    const jobId = await maybeCreateJobForReservation(ctx, updated._id, updated, connection, owner._id);
    const final = (await ctx.db.get(reservation._id))!;
    return {
      outcome: jobId ? "created" as const : final.linkedJobId ? "already_linked" as const : "not_eligible" as const,
      ...(final.linkedJobId ? { linkedJobId: final.linkedJobId } : {}),
      ...(final.skipReason ? { skipReason: final.skipReason } : {}),
      manualJobReviewRequired: args.kind === "non_guest_block" && !!final.linkedJobId,
    };
  },
});

/** Scope/version checks shared by the two review actions. No job writes. */
async function requireReconciliationSource(
  ctx: MutationCtx, reservationId: Id<"calendarReservations">, companyId: Id<"companies">,
  expectedEventVersion: string, expectedFeedRevision: number,
) {
  const reservation = await ctx.db.get(reservationId);
  if (!reservation || reservation.companyId !== companyId) throw new Error("Reservation not found");
  const connection = await ctx.db.get(reservation.connectionId);
  const property = await ctx.db.get(reservation.propertyId);
  if (!connection || connection.companyId !== companyId || connection.propertyId !== reservation.propertyId
    || !property || property.companyId !== companyId) throw new Error("Calendar source or property is unavailable");
  if (reservation.status !== "active" || reservation.eventVersion !== expectedEventVersion
    || (connection.feedRevision ?? 0) !== expectedFeedRevision
    || !expectedEventVersion.startsWith(`${connection.feedRevision ?? 0}:`)) throw new Error("Event or feed changed. Refresh and review again.");
  return reservation;
}

/** Owner attestation only: never merge rows, transfer links or create jobs. */
export const reviewReservationIdentity = mutation({
  args: {
    sessionToken: v.string(), userId: v.optional(v.id("users")), reservationId: v.id("calendarReservations"),
    expectedEventVersion: v.string(), expectedFeedRevision: v.number(), expectedRevision: v.number(),
    decision: v.union(v.literal("distinct"), v.literal("duplicate")), duplicateOf: v.optional(v.id("calendarReservations")),
  },
  returns: v.union(v.literal("reviewed"), v.literal("already_reviewed"), v.literal("stale")),
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    const reservation = await requireReconciliationSource(ctx, args.reservationId, owner.companyId!, args.expectedEventVersion, args.expectedFeedRevision);
    const current = await refreshIdentityReview(ctx, reservation, owner._id);
    const review = current.identityReview;
    if (!review || review.eventVersion !== current.eventVersion || !Number.isSafeInteger(args.expectedRevision)) throw new Error("Identity review is unavailable");
    if (review.state === args.decision && review.duplicateOf === args.duplicateOf
      && (args.expectedRevision === review.revision || args.expectedRevision === review.revision - 1)) return "already_reviewed" as const;
    // Commit refreshed evidence rather than throwing/rolling it back. The UI
    // receives the new revision and the owner must inspect it before retrying.
    if (review.revision !== args.expectedRevision || review.state !== "pending") return "stale" as const;
    if (args.decision === "distinct" && (review.incomplete || args.duplicateOf)) throw new Error("Identity evidence is incomplete. Manual review is required; automation stays blocked.");
    if (args.decision === "duplicate") {
      const target = args.duplicateOf ? await ctx.db.get(args.duplicateOf) : null;
      if (!target || !review.candidateIds.includes(target._id) || target._id === current._id
        || target.companyId !== current.companyId || target.propertyId !== current.propertyId
        || target.identityReview?.state === "duplicate") throw new Error("Choose a current same-property candidate that is not already suppressed");
    }
    const now = Date.now();
    await ctx.db.patch(current._id, {
      identityReview: { ...review, state: args.decision, revision: review.revision + 1,
        reviewedAt: now, reviewedBy: owner._id, ...(args.duplicateOf ? { duplicateOf: args.duplicateOf } : {}) },
      ...(!current.linkedJobId && args.decision === "duplicate" ? { jobCreationSkipped: true, skipReason: "duplicate_identity" } : {}),
      ...(!current.linkedJobId && args.decision === "distinct" && current.skipReason === "identity_review_required"
        ? { jobCreationSkipped: undefined, skipReason: undefined } : {}),
    });
    await logAudit(ctx, { companyId: current.companyId, userId: owner._id, action: "calendar_identity_reviewed",
      entityType: "calendarReservation", entityId: current._id,
      details: JSON.stringify({ decision: args.decision, duplicateOf: args.duplicateOf, revision: review.revision + 1,
        eventVersion: current.eventVersion, candidateIds: review.candidateIds, linkedJobId: current.linkedJobId }) });
    return "reviewed" as const;
  },
});

/** Acknowledgement does not clear a linked job discrepancy or change a job. */
export const acknowledgeReservationDates = mutation({
  args: {
    sessionToken: v.string(), userId: v.optional(v.id("users")), reservationId: v.id("calendarReservations"),
    expectedEventVersion: v.string(), expectedFeedRevision: v.number(), expectedRevision: v.number(),
  },
  returns: v.union(v.literal("acknowledged"), v.literal("already_acknowledged")),
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    const reservation = await requireReconciliationSource(ctx, args.reservationId, owner.companyId!, args.expectedEventVersion, args.expectedFeedRevision);
    const review = reservation.dateReview;
    if (!review || review.eventVersion !== reservation.eventVersion || !Number.isSafeInteger(args.expectedRevision)
      || review.proposedCheckIn !== reservation.checkIn || review.proposedCheckOut !== reservation.checkOut) throw new Error("Date review changed. Refresh and review again.");
    if (review.state === "acknowledged" && (args.expectedRevision === review.revision || args.expectedRevision === review.revision - 1)) return "already_acknowledged" as const;
    if (review.revision !== args.expectedRevision || review.state !== "pending") throw new Error("Date review changed. Refresh and review again.");
    await ctx.db.patch(reservation._id, { dateReview: { ...review, state: "acknowledged", revision: review.revision + 1, acknowledgedAt: Date.now(), acknowledgedBy: owner._id } });
    await logAudit(ctx, { companyId: reservation.companyId, userId: owner._id, action: "calendar_dates_acknowledged",
      entityType: "calendarReservation", entityId: reservation._id, details: JSON.stringify({ ...review, linkedJobId: reservation.linkedJobId }) });
    return "acknowledged" as const;
  },
});

/** Missing acknowledgement is separate from event classification. */
export const acknowledgeMissingReservation = mutation({
  args: {
    sessionToken: v.string(), userId: v.optional(v.id("users")),
    reservationId: v.id("calendarReservations"), episodeId: v.string(),
  },
  returns: v.union(v.literal("acknowledged"), v.literal("already_acknowledged")),
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    const reservation = await ctx.db.get(args.reservationId);
    if (!reservation || reservation.companyId !== owner.companyId) throw new Error("Reservation not found");
    if (!reservation.missing || reservation.missing.episodeId !== args.episodeId) {
      throw new Error("Missing-reservation episode has changed. Refresh and review again.");
    }
    if (reservation.missing.acknowledgedAt !== undefined) return "already_acknowledged" as const;
    await ctx.db.patch(reservation._id, {
      missing: { ...reservation.missing, acknowledgedAt: Date.now(), acknowledgedBy: owner._id },
    });
    await logAudit(ctx, {
      companyId: owner.companyId, userId: owner._id,
      action: "acknowledge_calendar_reservation_missing", entityType: "calendarReservation", entityId: reservation._id,
      details: JSON.stringify(reservation.missing),
    });
    return "acknowledged" as const;
  },
});

/**
 * Record a sync error for a connection.
 * Called when fetch, parsing, processing or persistence fails. The attempt
 * was already charged before external work; never advance the success time.
 */
export const recordSyncError = internalMutation({
  args: {
    connectionId: v.id("calendarConnections"),
    attemptId: v.string(),
    errorMessage: v.string(),
  },
  returns: v.union(v.literal("failed"), v.literal("skipped")),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    // Only the latest still-active attempt can finish this round. This also
    // rejects duplicate callbacks, lost success acknowledgements and old epochs.
    if (!connection || !isCurrentAttempt(connection, args.attemptId)) return "skipped" as const;

    const newErrorCount = connection.consecutiveErrors;

    const updates: Record<string, unknown> = {
      lastSyncStatus: "error" as const,
      lastSyncError: args.errorMessage.slice(0, 1000),
      syncAttempt: undefined,
      syncCooldownUntil: Date.now() + CALENDAR_SYNC_COOLDOWN_MS,
    };

    // Auto-disable after too many consecutive failures
    if (newErrorCount >= MAX_CONSECUTIVE_ERRORS) {
      updates.enabled = false;
      console.warn(
        `[calendarSync] Connection ${args.connectionId} disabled after ${newErrorCount} consecutive errors`
      );
    }

    await ctx.db.patch(args.connectionId, updates);

    // Write error sync log
    await ctx.db.insert("calendarSyncLogs", {
      connectionId: args.connectionId,
      companyId: connection.companyId,
      syncedAt: Date.now(),
      status: "error",
      eventsFound: 0,
      reservationsCreated: 0,
      errorMessage: args.errorMessage.slice(0, 1000),
    });
    return "failed" as const;
  },
});

/**
 * Manual sync trigger — owner-scoped mutation that schedules a sync action
 * for a specific connection. Safe for use from the frontend or Convex dashboard.
 *
 * Usage from dashboard: npx convex run mutations/calendarSync:triggerSync --args '{"userId":"...","connectionId":"..."}'
 */
export const triggerSync = mutation({
  args: {
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
    connectionId: v.id("calendarConnections"),
  },
  returns: v.union(v.literal("scheduled"), v.literal("busy"), v.literal("cooldown"), v.literal("suspended")),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) throw new Error("Connection not found");

    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    if (owner.companyId !== connection.companyId) throw new Error("Not your company");

    if (!connection.enabled) throw new Error("Connection is disabled");

    const outcome = await scheduleSync(ctx, connection, 0);
    if (outcome !== "scheduled") return outcome;

    await logAudit(ctx, {
      companyId: connection.companyId,
      userId: owner._id,
      action: "trigger_calendar_sync",
      entityType: "calendarConnection",
      entityId: args.connectionId,
    });
    return outcome;
  },
});
