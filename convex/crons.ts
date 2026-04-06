import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Calendar sync tick — runs every 15 minutes.
 *
 * Picks all enabled calendar connections that are due for sync
 * (last synced > 60 minutes ago, or never synced) and schedules
 * a sync action for each, staggered by 2 seconds to avoid burst.
 */
crons.interval(
  "calendar-sync-tick",
  { minutes: 15 },
  internal.mutations.calendarSync.cronTick
);

export default crons;
