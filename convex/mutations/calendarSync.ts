import { internalMutation, mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";
import { MutationCtx } from "../_generated/server";
import { requireOwner, logAudit } from "../lib/helpers";

/** Sync interval: connections are eligible for sync after this many ms. */
const SYNC_INTERVAL_MS = 60 * 60 * 1000; // 60 minutes

/** Stagger delay between scheduling sync actions to avoid burst. */
const STAGGER_MS = 2_000; // 2 seconds

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
  handler: async (ctx) => {
    const connections = await ctx.db
      .query("calendarConnections")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();

    const now = Date.now();
    let scheduled = 0;

    for (const connection of connections) {
      // Skip connections that were recently synced
      if (connection.lastSyncAt && now - connection.lastSyncAt < SYNC_INTERVAL_MS) {
        continue;
      }

      // Stagger each sync action to avoid burst
      await ctx.scheduler.runAfter(
        scheduled * STAGGER_MS,
        internal.actions.calendarSync.syncConnection,
        { connectionId: connection._id }
      );
      scheduled++;
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

  const jobId = await ctx.db.insert("jobs", {
    companyId: reservation.companyId,
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
 *   - Detect cancelled reservations (UIDs that disappeared from feed)
 *   - Update connection sync status
 *   - Write sync log entry
 */
export const processSyncResults = internalMutation({
  args: {
    connectionId: v.id("calendarConnections"),
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
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) {
      console.error(`[calendarSync] Connection ${args.connectionId} not found during processing`);
      return;
    }

    const now = Date.now();
    let reservationsCreated = 0;
    let reservationsUpdated = 0;
    let reservationsCancelled = 0;
    let jobsCreated = 0;

    // Build a set of UIDs present in this sync for cancellation detection
    const incomingUids = new Set(args.reservations.map((r) => r.uid));

    // ── Process each incoming reservation ──────────────────────────────

    for (const res of args.reservations) {
      // Look up existing reservation by externalUid + connectionId
      const existing = await ctx.db
        .query("calendarReservations")
        .withIndex("by_connectionId", (q) =>
          q.eq("connectionId", args.connectionId)
        )
        .filter((q) => q.eq(q.field("externalUid"), res.uid))
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

        // If reservation was previously cancelled but reappeared, reactivate
        if (existing.status === "cancelled") {
          updates.status = "active";
          updates.cancelledAt = undefined;
          updates.cancellationFlagged = undefined;
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

    // ── Detect cancellations ───────────────────────────────────────────
    // Reservations previously seen from this connection that are no longer
    // in the feed are marked as cancelled.

    const allExisting = await ctx.db
      .query("calendarReservations")
      .withIndex("by_connectionId", (q) =>
        q.eq("connectionId", args.connectionId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    for (const existing of allExisting) {
      if (!incomingUids.has(existing.externalUid)) {
        const updates: Record<string, unknown> = {
          status: "cancelled",
          cancelledAt: now,
        };

        // If a job was linked, flag for owner review (do NOT auto-cancel)
        if (existing.linkedJobId) {
          updates.cancellationFlagged = true;
        }

        await ctx.db.patch(existing._id, updates);
        reservationsCancelled++;
      }
    }

    // ── Update connection status ───────────────────────────────────────

    await ctx.db.patch(args.connectionId, {
      lastSyncAt: now,
      lastSyncStatus: "success" as const,
      lastSyncError: undefined,
      consecutiveErrors: 0,
    });

    // ── Write sync log ─────────────────────────────────────────────────

    await ctx.db.insert("calendarSyncLogs", {
      connectionId: args.connectionId,
      companyId: connection.companyId,
      syncedAt: now,
      status: "success",
      eventsFound: args.totalEvents,
      reservationsCreated,
      errorMessage: undefined,
    });

    console.log(
      `[calendarSync] Connection ${args.connectionId}: ` +
        `${args.totalEvents} events, ${reservationsCreated} new, ` +
        `${reservationsUpdated} updated, ${reservationsCancelled} cancelled, ` +
        `${jobsCreated} jobs created, ${args.skipped} skipped`
    );
  },
});

/**
 * Record a sync error for a connection.
 * Called from the sync action when fetch or parse fails.
 */
export const recordSyncError = internalMutation({
  args: {
    connectionId: v.id("calendarConnections"),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) return;

    const newErrorCount = (connection.consecutiveErrors ?? 0) + 1;
    const MAX_CONSECUTIVE_ERRORS = 3;

    const updates: Record<string, unknown> = {
      lastSyncAt: Date.now(),
      lastSyncStatus: "error" as const,
      lastSyncError: args.errorMessage,
      consecutiveErrors: newErrorCount,
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
      errorMessage: args.errorMessage,
    });
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
    connectionId: v.id("calendarConnections"),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) throw new Error("Connection not found");

    const owner = await requireOwner(ctx, args.userId);
    if (owner.companyId !== connection.companyId) throw new Error("Not your company");

    if (!connection.enabled) throw new Error("Connection is disabled");

    // Schedule the sync action immediately
    await ctx.scheduler.runAfter(
      0,
      internal.actions.calendarSync.syncConnection,
      { connectionId: args.connectionId }
    );

    await logAudit(ctx, {
      companyId: connection.companyId,
      userId: owner._id,
      action: "trigger_calendar_sync",
      entityType: "calendarConnection",
      entityId: args.connectionId,
    });
  },
});
