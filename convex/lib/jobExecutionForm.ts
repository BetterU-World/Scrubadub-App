import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getFormTemplate } from "./constants";
import { isPropertyConditionSection, jobRequiresPropertyConditionCheck } from "./propertyConditionRequirements";

/** Ensures every execution path shares one canonical job form and checklist. */
export async function ensureJobExecutionForm(
  ctx: MutationCtx,
  job: Doc<"jobs">,
  executorId: Id<"users">,
) {
  const existing = await ctx.db
    .query("forms")
    .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
    .first();
  if (existing) return existing._id;

  const formId = await ctx.db.insert("forms", {
    jobId: job._id,
    companyId: job.companyId,
    cleanerId: executorId,
    status: "in_progress",
  });
  const property = job.propertyId ? await ctx.db.get(job.propertyId) : null;
  const template = getFormTemplate(job.type, property?.type).filter(
    (section) => jobRequiresPropertyConditionCheck(job) || !isPropertyConditionSection(section.section),
  );
  let order = 0;
  for (const section of template) {
    for (const itemName of section.items) {
      await ctx.db.insert("formItems", {
        formId,
        section: section.section,
        itemName,
        completed: false,
        isRedFlag: false,
        order: order++,
      });
    }
  }
  return formId;
}
