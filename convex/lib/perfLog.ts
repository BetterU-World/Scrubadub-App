/**
 * Lightweight timing wrapper for Convex queries.
 *
 * Logs wall-clock duration and, when the result is an array, the row count.
 * Output goes to the Convex server console (visible in `npx convex dev` or
 * the Convex dashboard Logs tab).
 *
 * Usage:
 *   return await withPerfLog(ctx, "jobs:list", async () => {
 *     // …existing query logic…
 *   });
 */
export async function withPerfLog<T>(
  _ctx: unknown,
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  const result = await fn();
  const ms = Date.now() - start;
  const rowInfo = Array.isArray(result) ? ` (rows: ${result.length})` : "";
  console.log(`[perf] ${label} took ${ms}ms${rowInfo}`);
  return result;
}
