import type { Doc } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { workerProfileAllowsStaffAccess } from "./workerProfileAccess";

/** Legacy workers may have no profile. An explicitly disabled profile must not receive new work communications. */
export async function operationalWorkerAvailable(ctx: QueryCtx | MutationCtx, user: Doc<"users">) {
  if (user.status !== "active") return false;
  return workerProfileAllowsStaffAccess(ctx, user);
}
