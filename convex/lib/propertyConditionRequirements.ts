import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export type PropertyConditionOverride = "company_default" | "required" | "not_required";

export function jobRequiresPropertyConditionCheck(job: { requiresPropertyConditionCheck?: boolean }) {
  return job.requiresPropertyConditionCheck ?? true;
}

export function isPropertyConditionSection(section: string) {
  return section === "General Property Check" || section === "Final Walkthrough (Client Perspective)";
}

export async function resolvePropertyConditionRequirement(
  ctx: MutationCtx,
  args: {
    companyId: Id<"companies">;
    propertyId?: Id<"properties">;
    commercialAccountId?: Id<"commercialAccounts">;
  },
) {
  const settings = await ctx.db
    .query("companySettings")
    .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
    .first();
  let override: PropertyConditionOverride | undefined;
  if (args.propertyId) {
    const property = await ctx.db.get(args.propertyId);
    if (!property || property.companyId !== args.companyId) throw new Error("Property not found");
    override = property.propertyConditionCheckOverride;
  } else if (args.commercialAccountId) {
    const account = await ctx.db.get(args.commercialAccountId);
    if (!account || account.companyId !== args.companyId) throw new Error("Commercial account not found");
    override = account.propertyConditionCheckOverride;
  }
  if (override === "required") return true;
  if (override === "not_required") return false;
  return settings?.requirePropertyConditionChecksByDefault ?? true;
}
