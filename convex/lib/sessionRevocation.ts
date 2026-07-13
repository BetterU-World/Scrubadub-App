import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export type RevocationPrincipal =
  | { principalType: "staff"; userId: Id<"users"> }
  | { principalType: "client"; clientUserId: Id<"clientUsers"> };

/** Trusted exact-principal revocation. Staff and Client namespaces never overlap. */
export async function revokeAllSessionsForPrincipal(
  ctx: MutationCtx,
  principal: RevocationPrincipal,
  now: number,
  reason?: string
) {
  const sessions = principal.principalType === "staff"
    ? await ctx.db.query("authSessions").withIndex("by_userId", (q) => q.eq("userId", principal.userId)).collect()
    : await ctx.db.query("authSessions").withIndex("by_clientUserId", (q) => q.eq("clientUserId", principal.clientUserId)).collect();

  let revoked = 0;
  for (const session of sessions) {
    if (!session.revokedAt) {
      await ctx.db.patch(session._id, { revokedAt: now, revokedReason: reason });
      revoked++;
    }
  }
  return revoked;
}
