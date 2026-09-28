import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { approvedExecution } from "./performedWorkers";
type Ctx = MutationCtx | QueryCtx;
export async function sharedSource(ctx: Ctx, id: Id<"sharedJobs">) {
  const share = await ctx.db.get(id);
  if (!share || share.fromCompanyId === share.toCompanyId)
    throw new Error("Invalid shared source");
  const original = await ctx.db.get(share.originalJobId);
  const copy = await ctx.db.get(share.copiedJobId);
  if (
    !original ||
    !copy ||
    original.companyId !== share.fromCompanyId ||
    copy.companyId !== share.toCompanyId ||
    copy.sharedFromJobId !== original._id
  )
    throw new Error("Invalid shared source linkage");
  return { share, original, copy };
}
export async function partnerEligibility(
  ctx: Ctx,
  terms: Doc<"outgoingTerms">,
) {
  if (
    terms.source.type !== "partner_shared_job" ||
    !terms.partner ||
    terms.partner.state !== "accepted" ||
    !terms.acceptance
  )
    throw new Error("Accepted governing partner terms required");
  const { share, copy } = await sharedSource(ctx, terms.source.sharedJobId);
  if (
    share.governingTermsId !== terms._id ||
    !["accepted", "in_progress", "completed"].includes(share.status)
  )
    throw new Error("Accepted governing partner terms required");
  if (
    terms.partner.copiedJobId !== copy._id ||
    terms.partner.originalJobId !== share.originalJobId ||
    terms.partner.recipientCompanyId !== share.toCompanyId ||
    terms.lines.length !== 1 ||
    terms.lines[0].recipient.type !== "partner_company" ||
    terms.lines[0].recipient.companyId !== share.toCompanyId
  )
    throw new Error("Invalid partner financial unit");
  const execution = approvedExecution(copy);
  if (
    copy.status !== "approved" ||
    !copy.approvedAt ||
    !execution ||
    execution.provenance !== "submission_confirmed"
  )
    throw new Error("Approved shared execution required");
  return { share, copy, execution };
}
