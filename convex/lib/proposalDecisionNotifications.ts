import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { hasOwnerOrManagerPermission } from "./auth";
import { createNotification } from "./helpers";

/** Called only inside the mutation that changes a proposal into a final decision. */
export async function notifyProposalDecision(
  ctx: MutationCtx,
  proposal: any,
  decision: "accepted" | "declined",
  source: "client_token" | "owner_reported",
  actorUserId?: Id<"users">,
) {
  const companyUsers = await ctx.db.query("users")
    .withIndex("by_companyId", (q) => q.eq("companyId", proposal.companyId))
    .collect();
  const recipients = companyUsers.filter((user) =>
    user.status === "active" && user._id !== actorUserId && (
      user.role === "owner" ||
      (user._id === proposal.createdByUserId && hasOwnerOrManagerPermission(user, "canManageSalesAndCommercial"))
    ));
  for (const recipient of recipients) {
    await createNotification(ctx, {
      companyId: proposal.companyId,
      userId: recipient._id,
      type: decision === "accepted" ? "proposal_accepted" : "proposal_declined",
      title: decision === "accepted" ? "Proposal accepted" : "Proposal declined",
      message: source === "client_token"
        ? `The client ${decision} ${proposal.title}. Review the request and next steps.`
        : `${proposal.title} was marked ${decision} outside SCRUB. Review the request and next steps.`,
      relatedClientRequestId: proposal.clientRequestId,
    });
  }
}
