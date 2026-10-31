"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { parseICalFeed } from "./icalParser";
import { assertExternalSideEffectsAllowed } from "../lib/environment";
import { randomUUID } from "node:crypto";

/**
 * Fetch and parse an iCal feed for a single calendar connection.
 *
 * Flow:
 *   1. Claim queued work (or admit older/direct work) and read its feed URL
 *   2. HTTP fetch the iCal URL
 *   3. Parse with icalParser
 *   4. Pass normalized results to the processor mutation for persistence
 *
 * Scheduled from the cron tick or from the manual trigger mutation.
 */
export const syncConnection = internalAction({
  args: {
    connectionId: v.id("calendarConnections"),
    attemptId: v.optional(v.string()),
  },
  returns: v.union(v.literal("success"), v.literal("empty"), v.literal("failed"), v.literal("skipped")),
  handler: async (ctx, args): Promise<"success" | "empty" | "failed" | "skipped"> => {
    assertExternalSideEffectsAllowed("External calendar synchronization");
    // 1. Claim admission and obtain its current feed URL atomically.
    const attemptId = args.attemptId ?? randomUUID();
    const icalUrl = await ctx.runMutation(
      internal.mutations.calendarSync.beginSyncAttempt,
      { connectionId: args.connectionId, attemptId, scheduled: args.attemptId !== undefined },
    );
    if (icalUrl === null) return "skipped" as const;

    // 2. Fetch the iCal feed
    let stage = "Fetch";
    try {
      const response = await fetch(icalUrl, {
        headers: { "User-Agent": "SCRUB-CalendarSync/1.0" },
        signal: AbortSignal.timeout(30_000), // 30s timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const rawIcs = await response.text();

      if (!rawIcs || rawIcs.trim().length === 0) {
        throw new Error("Empty response from iCal URL");
      }
      // 3. Parse the feed
      stage = "Parse";
      const parseResult = parseICalFeed(rawIcs);
      if (parseResult.status !== "valid" && parseResult.status !== "valid_empty") {
        throw new Error(parseResult.diagnostic ?? "Unsafe iCalendar snapshot");
      }

      // 4. Processing and success recording commit together in this mutation.
      stage = "Processing";
      return await ctx.runMutation(
        internal.mutations.calendarSync.processSyncResults,
        {
          connectionId: args.connectionId,
          attemptId,
          snapshotStatus: parseResult.status,
          cancelledUids: parseResult.cancelledUids,
          reservations: parseResult.reservations.map((r) => ({
            uid: r.uid,
            summary: r.summary,
            checkIn: r.checkIn,
            checkOut: r.checkOut,
            dtStamp: r.dtStamp,
            rawHash: r.rawHash,
            classificationHash: r.classificationHash,
            eventMetadata: r.eventMetadata,
          })),
          totalEvents: parseResult.totalEvents,
          skipped: parseResult.skipped,
        }
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const errorMessage = `${stage} error: ${message}`.slice(0, 1000);
      console.error(`[calendarSync] ${stage} failed for ${args.connectionId}: ${message}`);
      // One recording attempt only. If it fails, propagate the failure; the
      // precharged round still expires and counts toward background suspension.
      return await ctx.runMutation(internal.mutations.calendarSync.recordSyncError, {
        connectionId: args.connectionId,
        attemptId,
        errorMessage,
      });
    }
  },
});
