import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getJobRecipientUserIds } from "./teams";

export const executionEvidence = v.object({
  sequence: v.number(),
  provenance: v.union(
    v.literal("submission_confirmed"),
    v.literal("owner_confirmed_historical"),
  ),
  confirmedById: v.id("users"),
  confirmedAt: v.number(),
  scheduledDate: v.string(),
  sourceLabel: v.optional(v.string()),
  workers: v.array(
    v.object({
      userId: v.id("users"),
      displayName: v.string(),
      role: v.string(),
    }),
  ),
});

export async function freezePerformedWorkers(
  ctx: MutationCtx,
  job: Doc<"jobs">,
  actor: Doc<"users">,
  ids: Id<"users">[] | undefined,
  historical = false,
) {
  if (
    !ids ||
    !ids.length ||
    ids.length > 100 ||
    new Set(ids).size !== ids.length
  )
    throw new Error("Confirm the workers who performed this job");
  const candidates = new Set(await getJobRecipientUserIds(ctx, job));
  if (job.assignedManagerId) candidates.add(job.assignedManagerId);
  const workers = [];
  for (const id of ids) {
    const worker = await ctx.db.get(id);
    if (
      !worker ||
      worker.companyId !== job.companyId ||
      !["owner", "manager", "cleaner", "maintenance"].includes(worker.role)
    )
      throw new Error("Invalid performed worker");
    if (!historical && (!candidates.has(id) || worker.status !== "active"))
      throw new Error(
        "Performed worker must be a current available job assignee",
      );
    workers.push({
      userId: worker._id,
      displayName: worker.name,
      role: worker.role,
    });
  }
  const property = job.propertyId ? await ctx.db.get(job.propertyId) : null;
  const evidence = {
    sequence: (job.executionHistory?.length ?? 0) + 1,
    provenance: historical
      ? ("owner_confirmed_historical" as const)
      : ("submission_confirmed" as const),
    confirmedById: actor._id,
    confirmedAt: Date.now(),
    scheduledDate: job.scheduledDate,
    sourceLabel: `${property?.name ?? job.propertySnapshot?.name ?? job.type} · ${job.scheduledDate}`,
    workers,
  };
  await ctx.db.patch(job._id, {
    executionHistory: [...(job.executionHistory ?? []), evidence],
    submittedExecutionSequence: evidence.sequence,
    ...(historical ? { approvedExecutionSequence: evidence.sequence } : {}),
  });
  return evidence;
}

export function approvedExecution(job: Doc<"jobs">) {
  return job.executionHistory?.find(
    (e) => e.sequence === job.approvedExecutionSequence,
  );
}
