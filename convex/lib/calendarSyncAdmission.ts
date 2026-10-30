import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const CALENDAR_SYNC_COOLDOWN_MS = 60_000;
export const CALENDAR_SYNC_LEASE_MS = 10 * 60_000;

/** Explicit owner cancellation is not a failed attempt. Retain earlier errors,
 * but refund this live precharge and invalidate all callbacks/cooldowns.
 */
export function cancelledCalendarSyncFields(connection: Doc<"calendarConnections">) {
  const live = connection.syncAttempt !== undefined &&
    Date.now() - connection.syncAttempt.chargedAt < CALENDAR_SYNC_LEASE_MS;
  return {
    syncAttempt: undefined,
    syncCooldownUntil: undefined,
    consecutiveErrors: Math.max(0, connection.consecutiveErrors - (live ? 1 : 0)),
  };
}

/** Cancel queued work when its lease is invalidated or replaced. Running
 * actions cannot be stopped here; their attempt fence rejects late results.
 */
export async function cancelPendingCalendarSync(ctx: MutationCtx, connection: Doc<"calendarConnections">) {
  const scheduledId = connection.syncAttempt?.scheduledFunctionId;
  if (!scheduledId) return;
  const scheduled = await ctx.db.system.get(scheduledId);
  if (scheduled?.state.kind === "pending") await ctx.scheduler.cancel(scheduledId);
}
