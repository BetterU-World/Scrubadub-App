import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { canManageBusinessConfiguration, hasOwnerOrManagerPermission } from "./auth";
import { requireOwnerManagerSession, StaffAuthorizationDenied } from "./sessionAuth";

export function smartEstimatePreviewEnabled(companyId: Id<"companies">) {
  return process.env.SCRUB_SMART_ESTIMATES_PREVIEW_COMPANY_ID === companyId;
}

export function smartEstimatePermissions(actor: Doc<"users">) {
  return {
    sales: hasOwnerOrManagerPermission(actor, "canManageSalesAndCommercial"),
    configuration: canManageBusinessConfiguration(actor),
  };
}

export async function requireSmartEstimatePreview(
  ctx: QueryCtx | MutationCtx,
  args: { userId: Id<"users">; sessionToken: string },
  permission: "sales" | "configuration" | "either",
) {
  const actor = await requireOwnerManagerSession(ctx, args.sessionToken, args.userId);
  if (!smartEstimatePreviewEnabled(actor.companyId)) throw new StaffAuthorizationDenied("Smart Estimates preview is disabled");
  const access = smartEstimatePermissions(actor);
  if (permission === "either" ? !access.sales && !access.configuration : !access[permission]) {
    throw new StaffAuthorizationDenied("Smart Estimates permission required");
  }
  return actor;
}
