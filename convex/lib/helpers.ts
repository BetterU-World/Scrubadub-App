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

export async function requireAuth(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  const user = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", identity.email!))
    .first();
  if (!user) throw new Error("User not found");
  if (user.status !== "active") throw new Error("Account not active");
  return user;
}

export async function requireOwner(ctx: QueryCtx) {
  const user = await requireAuth(ctx);
  if (user.role !== "owner") throw new Error("Owner access required");
  return user;
}

export async function requireCompanyMember(
  ctx: QueryCtx,
  companyId: Id<"companies">
) {
  const user = await requireAuth(ctx);
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
