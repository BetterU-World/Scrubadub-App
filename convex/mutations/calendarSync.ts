import { internalMutation, mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { requireOwner, logAudit } from "../lib/helpers";

/** Sync interval: connections are eligible for sync after this many ms. */
const SYNC_INTERVAL_MS = 60 * 60 * 1000; // 60 minutes

/** Stagger delay between scheduling sync actions to avoid burst. */
const STAGGER_MS = 2_000; // 2 seconds

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
 * Process parsed iCal sync results for a single connection.
 *
 * Responsibilities:
 *   - Create or update calendarReservations
 *   - Detect cancelled reservations (UIDs that disappeared from feed)
 *   - Update connection sync status
 *   - Write sync log entry
 *
 * Does NOT create jobs — that is a future phase.
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
        //
        // Determine if this reservation falls before the initial sync cutoff.
        // Reservations with checkOut <= initialSyncCutoff are stored for
        // history but flagged so future job creation skips them.
        const beforeCutoff = res.checkOut <= connection.initialSyncCutoff;

        await ctx.db.insert("calendarReservations", {
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
          // Historical reservations are stored but flagged for skip
          ...(beforeCutoff
            ? {
                jobCreationSkipped: true,
                skipReason: "before_initial_sync_cutoff",
              }
            : {}),
        });
        reservationsCreated++;
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

        // If a job was linked, flag for owner review
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
        `${args.skipped} skipped`
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
