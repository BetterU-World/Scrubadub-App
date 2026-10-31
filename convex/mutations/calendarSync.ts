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

/**
 * Attempt to create a calendar-sync job for a reservation.
 *
 * Returns the new job ID, or null if creation was skipped (with the
 * reservation flagged accordingly).
 */
async function maybeCreateJobForReservation(
  ctx: MutationCtx,
  reservationId: Id<"calendarReservations">,
  reservation: Doc<"calendarReservations">,
  connection: Doc<"calendarConnections">,
): Promise<Id<"jobs"> | null> {
  // ── Gate 1: reservation already has a linked job ──────────────────
  if (reservation.linkedJobId) return null;

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
    userId: connection.createdBy,
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
        args.reservations.some((r) => !r.uid.trim() || r.checkOut <= r.checkIn)) {
      throw new Error("Unsafe or unvalidated iCalendar snapshot");
    }

    const now = Date.now();
    let reservationsCreated = 0;
    let reservationsUpdated = 0;
    let reservationsCancelled = 0;
    let reservationsMissing = 0;
    let jobsCreated = 0;

    // Build a set of UIDs present in this sync for cancellation detection
    const incomingUids = new Set(args.reservations.map((r) => r.uid));

    // ── Process each incoming reservation ──────────────────────────────

    for (const res of args.reservations) {
      // Look up existing reservation by externalUid + connectionId
      const existing = await ctx.db
        .query("calendarReservations")
        .withIndex("by_connectionId_externalUid", (q) =>
          q.eq("connectionId", args.connectionId).eq("externalUid", res.uid)
        )
        .first();

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

        // Attempt job creation for eligible new reservations
        if (!beforeCutoff) {
          const reservation = await ctx.db.get(reservationId);
          if (reservation) {
            const jobId = await maybeCreateJobForReservation(
              ctx, reservationId, reservation, connection
            );
            if (jobId) jobsCreated++;
          }
        }
      } else {
        // ── Existing reservation ───────────────────────────────────────

        const updates: Record<string, unknown> = { lastSeenAt: now };
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
        if (existing.rawHash !== res.rawHash) {
          // Track if checkout date specifically changed (for future flagging)
          if (existing.checkOut !== res.checkOut && existing.linkedJobId) {
            updates.dateConflict = true;
            updates.originalCheckOut = existing.checkOut;
          }

          updates.checkIn = res.checkIn;
          updates.checkOut = res.checkOut;
          updates.summary = res.summary;
          updates.dtStamp = res.dtStamp;
          updates.rawHash = res.rawHash;
          reservationsUpdated++;
        }

        await ctx.db.patch(existing._id, updates);

        // Retry job creation for reservations that don't yet have a job.
        // This covers: reactivated cancelled reservations, and reservations
        // previously skipped for a temporary reason (rules disabled, duplicate).
        if (!existing.linkedJobId) {
          const updated = await ctx.db.get(existing._id);
          if (updated) {
            const jobId = await maybeCreateJobForReservation(
              ctx, existing._id, updated, connection
            );
            if (jobId) jobsCreated++;
          }
        }
      }
    }

    // Only explicit provider cancellation evidence may cancel a reservation.
    // Include already-cancelled rows so a legacy cancellation can gain actual
    // evidence when observed, without inferring or repairing historical state.
    for (const uid of cancelledUids) {
      const existing = await ctx.db.query("calendarReservations")
        .withIndex("by_connectionId_externalUid", (q) => q.eq("connectionId", args.connectionId).eq("externalUid", uid))
        .first();
      if (!existing || (existing.status === "cancelled" && existing.cancellationEvidence)) continue;
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

/** Acknowledgement records owner review, not cancellation or job resolution. */
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
