import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

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
      | "job_cancelled"
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
      | "new_client_request"
      | "inspection_submitted"
      | "calendar_sync_alert"
      | "service_agreement_accepted"
      | "service_agreement_declined";
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
