import { v, type Infer } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

// These are the only public recordEvent callers, including pre-#256 clients.
// Completion/report/roadmap and email milestones remain server-owned.
export const telemetryEventKey = v.union(
  v.literal("assessment_resumed"),
  v.literal("assessment_progress"),
  v.literal("scrub_support_cta_clicked"),
);
export const telemetryMetadata = v.object({
  definitionVersion: v.optional(v.number()),
  scoringVersion: v.optional(v.number()),
  reportVersion: v.optional(v.number()),
  roadmapVersion: v.optional(v.number()),
  maturityKey: v.optional(v.string()),
  confidenceKey: v.optional(v.string()),
  branchType: v.optional(v.string()),
  scoreBand: v.optional(v.string()),
  deviceCategory: v.optional(v.union(v.literal("mobile"), v.literal("desktop"))),
  sectionKey: v.optional(v.string()),
  questionKey: v.optional(v.string()),
  sessionId: v.optional(v.string()),
});

export const TELEMETRY_LIMITS = {
  // More than three complete 32-question sessions in ten minutes. One reusable
  // row per attempt, shared across sessions so rotating session IDs cannot evade it.
  attempt: { limit: 120, windowMs: 10 * 60_000 },
  global: { limit: 500, windowMs: 60_000 },
} as const;

export function validTelemetry(args: {
  attemptId?: string;
  capability?: string;
  eventKey: Infer<typeof telemetryEventKey>;
  deduplicationKey: string;
  metadata?: Infer<typeof telemetryMetadata>;
}) {
  if (!args.attemptId || !args.capability || !/^[a-f0-9]{64}$/i.test(args.capability)) return false;
  if (!args.deduplicationKey.length || args.deduplicationKey.length > 160) return false;
  const metadata = args.metadata ?? {};
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000)) return false;
    if (typeof value === "string") {
      const max = key === "questionKey" ? 120 : key === "sessionId" ? 64 : 80;
      const pattern = key === "sessionId" ? /^[a-f0-9]{16,64}$/i : /^[a-z0-9_.-]+$/;
      if (value.length > max || !pattern.test(value)) return false;
    }
  }
  if (new TextEncoder().encode(JSON.stringify(metadata)).length > 2048) return false;
  const prefix = `${args.attemptId}:${args.eventKey}`;
  // Exact legacy keys preserve first-write language/timestamp semantics and keep
  // public callers from reserving another attempt's or a server milestone's key.
  if (args.eventKey === "scrub_support_cta_clicked") return args.deduplicationKey === prefix;
  if (!metadata.sessionId) return false;
  if (args.eventKey === "assessment_resumed") return args.deduplicationKey === `${prefix}:${metadata.sessionId}`;
  return Boolean(metadata.sectionKey && metadata.questionKey &&
    args.deduplicationKey === `${prefix}:${metadata.sessionId}:${metadata.questionKey}`);
}

/** Check small indexed counters before loading an attempt with large snapshots.
 * Charge only after capability verification, atomically with the event insert.
 * Duplicate/invalid/throttled calls write nothing. No caller-supplied budget keys.
 */
export async function telemetryAdmission(ctx: MutationCtx, attemptId: string) {
  const now = Date.now();
  const counters: Array<{ row: Doc<"rateLimits"> | null; key: string; windowStartMs: number; count: number }> = [];
  for (const [key, policy] of [
    [`assessment:telemetry:${attemptId}`, TELEMETRY_LIMITS.attempt],
    ["assessment:event:global", TELEMETRY_LIMITS.global],
  ] as const) {
    const row = await ctx.db.query("rateLimits").withIndex("by_key", (q) => q.eq("key", key)).first();
    const reset = !row || now - row.windowStartMs >= policy.windowMs;
    if (!reset && row.count >= policy.limit) return null;
    counters.push({ row, key, windowStartMs: reset ? now : row!.windowStartMs, count: reset ? 1 : row!.count + 1 });
  }
  return async () => {
    for (const { row, key, windowStartMs, count } of counters) {
      if (row) await ctx.db.patch(row._id, { windowStartMs, count });
      else await ctx.db.insert("rateLimits", { key, windowStartMs, count });
    }
  };
}
