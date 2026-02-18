import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

// Session-based authentication: validates session token,
// returns the authenticated user. Never trusts client-supplied userId.
export async function requireAuth(ctx: QueryCtx, sessionToken: string) {
  if (!sessionToken) throw new Error("Not authenticated");

  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", sessionToken))
    .first();
  if (!session) throw new Error("Not authenticated");
  if (session.expiresAt < Date.now()) throw new Error("Session expired");

  const user = await ctx.db.get(session.userId);
  if (!user) throw new Error("User not found");
  if (user.status !== "active") throw new Error("Account not active");
  return user;
}

export async function requireOwner(ctx: QueryCtx, sessionToken: string) {
  const user = await requireAuth(ctx, sessionToken);
  if (user.role !== "owner") throw new Error("Owner access required");
  return user;
}

export async function logAudit(
  ctx: MutationCtx,
  params: {
    companyId: Id<"companies">;
    userId: Id<"users">;
    action: string;
    entityType: string;
    entityId: string;
    details?: string;
  }
) {
  await ctx.db.insert("auditLog", {
    ...params,
    timestamp: Date.now(),
  });
}

export async function createNotification(
  ctx: MutationCtx,
  params: {
    companyId: Id<"companies">;
    userId: Id<"users">;
    type:
      | "job_assigned"
      | "job_confirmed"
      | "job_denied"
      | "job_started"
      | "job_submitted"
      | "job_approved"
      | "rework_requested"
      | "red_flag"
      | "invite";
    title: string;
    message: string;
    relatedJobId?: Id<"jobs">;
  }
) {
  await ctx.db.insert("notifications", {
    ...params,
    read: false,
  });
}
