import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { companyAddOnSelectionVersion } from "./companyAddOnSelection";

export const publicCompanyAddOnValidator = v.object({
  addOnId: v.id("companyAddOns"),
  name: v.string(),
  description: v.union(v.string(), v.null()),
  pricingMethod: v.union(v.literal("flat"), v.literal("starting_at"), v.literal("per_unit")),
  priceCents: v.number(),
  unitLabel: v.union(v.string(), v.null()),
  estimatedDurationMinutes: v.union(v.number(), v.null()),
  displayOrder: v.number(),
  selectionVersion: v.string(),
});

export async function listPublicCompanyAddOns(ctx: QueryCtx, companyId: Id<"companies">) {
  const records = await ctx.db.query("companyAddOns")
    .withIndex("by_companyId_active_displayOrder", (q) => q.eq("companyId", companyId).eq("isActive", true))
    .collect();
  return records
    .filter((record) => record.isPublic && record.archivedAt === undefined)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.createdAt - b.createdAt || a._id.localeCompare(b._id))
    .map((record) => ({
      addOnId: record._id,
      name: record.name,
      description: record.description ?? null,
      pricingMethod: record.pricingMethod,
      priceCents: record.priceCents,
      unitLabel: record.unitLabel ?? null,
      estimatedDurationMinutes: record.estimatedDurationMinutes ?? null,
      displayOrder: record.displayOrder,
      selectionVersion: companyAddOnSelectionVersion(record),
    }));
}
