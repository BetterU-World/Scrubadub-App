import type { Infer } from "convex/values";
import { jobScheduleChange } from "./jobScheduleModel";
import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { operationalWorkerAvailable } from "./operationalWorkerEligibility";

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
      | "job_schedule_changed"
      | "job_assigned"
      | "job_confirmed"
      | "job_denied"
      | "worker_decline_review"
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
      | "proposal_accepted"
      | "proposal_declined"
      | "inspection_submitted"
      | "calendar_sync_alert"
      | "service_agreement_accepted"
      | "service_agreement_declined"
      | "commercial_account_paused"
      | "commercial_account_resumed"
      | "commercial_account_ended";
    title: string;
    message: string;
    scheduleChange?: Infer<typeof jobScheduleChange>;
    relatedJobId?: Id<"jobs">;
    relatedClientRequestId?: Id<"clientRequests">;
    relatedCommercialAccountId?: Id<"commercialAccounts">;
  }
) {
  if (params.type !== "invite") {
    const recipient = await ctx.db.get(params.userId);
    if (!recipient || !await operationalWorkerAvailable(ctx, recipient)) return;
  }
  await ctx.db.insert("notifications", {
    ...params,
    read: false,
  });
}
