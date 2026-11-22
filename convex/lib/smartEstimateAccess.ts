import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { canManageBusinessConfiguration, hasOwnerOrManagerPermission } from "./auth";
import { requireOwnerManagerSession, StaffAuthorizationDenied } from "./sessionAuth";
import { smartEstimatesAuthoringEnabled } from "./smartEstimatesRelease";

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
  if (!await smartEstimatesAuthoringEnabled(ctx, actor.companyId, "estimates")) {
    throw new StaffAuthorizationDenied("Smart Estimates authoring is disabled");
  }
  const access = smartEstimatePermissions(actor);
  if (permission === "either" ? !access.sales && !access.configuration : !access[permission]) {
    throw new StaffAuthorizationDenied("Smart Estimates permission required");
  }
  return actor;
}
