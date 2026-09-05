"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { parseICalFeed } from "./icalParser";
import { assertExternalSideEffectsAllowed } from "../lib/environment";

/**
 * Fetch and parse an iCal feed for a single calendar connection.
 *
 * Flow:
 *   1. Read the connection doc (via internal query)
 *   2. HTTP fetch the iCal URL
 *   3. Parse with icalParser
 *   4. Pass normalized results to the processor mutation for persistence
 *
 * Scheduled from the cron tick or from the manual trigger mutation.
 */
export const syncConnection = internalAction({
  args: {
    connectionId: v.id("calendarConnections"),
  },
  handler: async (ctx, args) => {
    assertExternalSideEffectsAllowed("External calendar synchronization");
    // 1. Read the connection
    const connection = await ctx.runQuery(
      internal.queries.calendarConnections.getConnectionInternal,
      { connectionId: args.connectionId }
    );

    if (!connection) {
      console.error(`[calendarSync] Connection ${args.connectionId} not found`);
      return;
    }

    if (!connection.enabled) {
      console.log(`[calendarSync] Connection ${args.connectionId} is disabled, skipping`);
      return;
    }

    // 2. Fetch the iCal feed
    let rawIcs: string;
    try {
      const response = await fetch(connection.icalUrl, {
        headers: { "User-Agent": "SCRUB-CalendarSync/1.0" },
        signal: AbortSignal.timeout(30_000), // 30s timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      rawIcs = await response.text();

      if (!rawIcs || rawIcs.trim().length === 0) {
        throw new Error("Empty response from iCal URL");
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[calendarSync] Fetch failed for ${args.connectionId}: ${message}`);

      // Record the error
      await ctx.runMutation(
        internal.mutations.calendarSync.recordSyncError,
        {
          connectionId: args.connectionId,
          errorMessage: message,
        }
      );
      return;
    }

    // 3. Parse the feed
    let parseResult;
    try {
      parseResult = parseICalFeed(rawIcs);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[calendarSync] Parse failed for ${args.connectionId}: ${message}`);

      await ctx.runMutation(
        internal.mutations.calendarSync.recordSyncError,
        {
          connectionId: args.connectionId,
          errorMessage: `Parse error: ${message}`,
        }
      );
      return;
    }

    // 4. Pass results to the processor mutation
    await ctx.runMutation(
      internal.mutations.calendarSync.processSyncResults,
      {
        connectionId: args.connectionId,
        reservations: parseResult.reservations.map((r) => ({
          uid: r.uid,
          summary: r.summary,
          checkIn: r.checkIn,
          checkOut: r.checkOut,
          dtStamp: r.dtStamp,
          rawHash: r.rawHash,
        })),
        totalEvents: parseResult.totalEvents,
        skipped: parseResult.skipped,
      }
    );
  },
});
