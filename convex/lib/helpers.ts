import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

export async function getAuthSessionId(
  ctx: QueryCtx
): Promise<Id<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const user = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", identity.email!))
    .first();
  return user?._id ?? null;
}

export async function requireAuth(ctx: QueryCtx, userId?: Id<"users">) {
  // Prefer explicit userId when provided (client-side auth)
  if (userId) {
    const user = await ctx.db.get(userId);
    if (user && user.status === "active") return user;
  }
  // Fall back to Convex identity (when auth provider is configured)
  const identity = await ctx.auth.getUserIdentity();
  if (identity?.email) {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();
    if (user && user.status === "active") return user;
  }
  throw new Error("Not authenticated");
}

export async function requireOwner(ctx: QueryCtx, userId?: Id<"users">) {
  const user = await requireAuth(ctx, userId);
  if (user.role === "owner") return user;
  // Identity resolved to non-owner; try explicit userId fallback
  if (userId) {
    const explicit = await ctx.db.get(userId);
    if (explicit && explicit.status === "active" && explicit.role === "owner") return explicit;
  }
  throw new Error("Owner access required");
}

export async function requireCompanyMember(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  userId?: Id<"users">
) {
  const user = await requireAuth(ctx, userId);
  if (user.companyId !== companyId) throw new Error("Not a member of this company");
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
      | "job_accepted"
      | "job_reassigned"
      | "rework_requested"
      | "red_flag"
      | "invite"
      | "job_shared"
      | "partner_request"
      | "partner_accepted"
      | "shared_job_accepted"
      | "shared_job_rejected"
      | "new_client_request";
    title: string;
    message: string;
    relatedJobId?: Id<"jobs">;
    relatedClientRequestId?: Id<"clientRequests">;
  }
) {
  await ctx.db.insert("notifications", {
    ...params,
    read: false,
  });
}
