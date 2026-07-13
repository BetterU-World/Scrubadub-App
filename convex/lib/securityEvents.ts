import { v } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export const securityEventTypeValidator = v.union(
  v.literal("staff_login_success"),
  v.literal("client_login_success"),
  v.literal("login_failure"),
  v.literal("staff_password_reset_requested"),
  v.literal("client_password_reset_requested"),
  v.literal("staff_password_reset_completed"),
  v.literal("client_password_reset_completed"),
  v.literal("session_logout"),
  v.literal("sessions_revoked"),
  v.literal("account_disabled"),
  v.literal("account_reactivated"),
  v.literal("staff_invitation_accepted"),
  v.literal("client_invitation_accepted"),
  v.literal("affiliate_invitation_accepted"),
  v.literal("affiliate_invitation_revoked"),
  v.literal("superadmin_financial_state_changed")
);
export const securityPrincipalTypeValidator = v.union(v.literal("staff"), v.literal("client"));
export const securityOutcomeValidator = v.union(v.literal("success"), v.literal("failure"));
export const securityMetadataValidator = v.record(v.string(), v.string());

type EventType =
  | "staff_login_success" | "client_login_success" | "login_failure"
  | "staff_password_reset_requested" | "client_password_reset_requested"
  | "staff_password_reset_completed" | "client_password_reset_completed"
  | "session_logout" | "sessions_revoked" | "account_disabled" | "account_reactivated"
  | "staff_invitation_accepted" | "client_invitation_accepted"
  | "affiliate_invitation_accepted" | "affiliate_invitation_revoked"
  | "superadmin_financial_state_changed";

export type SecurityEventInput = {
  eventType: EventType;
  principalType?: "staff" | "client";
  staffUserId?: Id<"users">;
  clientUserId?: Id<"clientUsers">;
  companyId?: Id<"companies">;
  outcome: "success" | "failure";
  metadata?: Record<string, string>;
};

const ALLOWED_METADATA = new Set(["category", "reason", "source", "entityType", "entityId", "previousStatus", "newStatus", "operation"]);
const SECRET_KEY = /password|hash|token|secret|authorization|cookie/i;
const ORDINARY_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const FINANCIAL_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

export function sanitizeSecurityMetadata(metadata?: Record<string, string>) {
  if (!metadata) return undefined;
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!ALLOWED_METADATA.has(key) || SECRET_KEY.test(key)) continue;
    sanitized[key] = String(value).replace(/[\r\n]/g, " ").slice(0, 200);
  }
  return Object.keys(sanitized).length ? sanitized : undefined;
}

/** Internal server-only writer. Observability failures never block the primary operation. */
export async function writeSecurityEvent(ctx: MutationCtx, input: SecurityEventInput) {
  try {
    const now = Date.now();
    const isFinancial = input.eventType === "superadmin_financial_state_changed";
    await ctx.db.insert("securityEvents", {
      eventType: input.eventType,
      principalType: input.principalType,
      staffUserId: input.principalType === "staff" ? input.staffUserId : undefined,
      clientUserId: input.principalType === "client" ? input.clientUserId : undefined,
      companyId: input.companyId,
      outcome: input.outcome,
      metadata: sanitizeSecurityMetadata(input.metadata),
      createdAt: now,
      expiresAt: now + (isFinancial ? FINANCIAL_RETENTION_MS : ORDINARY_RETENTION_MS),
      retentionClass: isFinancial ? "financial_365d" : "security_90d",
    });
  } catch (error) {
    console.error("[security-events] event write failed", error instanceof Error ? error.message : "unknown");
  }
}
