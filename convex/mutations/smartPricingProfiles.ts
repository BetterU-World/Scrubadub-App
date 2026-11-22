import { v } from "convex/values";
import { internalMutation, mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { canManageBusinessConfiguration } from "../lib/auth";
import { requireOwnerManagerSession } from "../lib/sessionAuth";
import { requireSmartEstimatePreview } from "../lib/smartEstimateAccess";
import { calculateEstimate, estimateBaseValidator, validateEstimateDraft } from "../lib/smartEstimatePricing";

const profileFields = { name: v.string(), defaults: estimateBaseValidator };
const currentProfile = { profileId: v.id("smartPricingProfiles"), expectedRevisionId: v.id("smartPricingProfileRevisions") };
const args = {
  userId: v.id("users"), sessionToken: v.string(),
  operation: v.union(
    v.object({ kind: v.literal("create"), ...profileFields }),
    v.object({ kind: v.literal("edit"), ...currentProfile, ...profileFields }),
    v.object({ kind: v.literal("duplicate"), ...currentProfile, name: v.string() }),
    v.object({ kind: v.literal("archive"), ...currentProfile }),
  ),
};

export const change = internalMutation({
  args, returns: v.id("smartPricingProfiles"),
  handler: async (ctx, { userId, sessionToken, operation }) => {
    const actor = await requireOwnerManagerSession(ctx, sessionToken, userId);
    if (!canManageBusinessConfiguration(actor)) throw new Error("Business configuration permission required");
    const existing = operation.kind === "create" ? null : await ctx.db.get(operation.profileId);
    const revision = existing?.currentRevisionId ? await ctx.db.get(existing.currentRevisionId) : null;
    if (operation.kind !== "create" &&
        (!existing || existing.companyId !== actor.companyId || existing.archivedAt !== undefined ||
          !revision || revision.companyId !== actor.companyId || revision.profileId !== existing._id ||
          revision._id !== operation.expectedRevisionId)) {
      throw new Error("Pricing profile is unavailable or has changed");
    }
    if (operation.kind === "archive") {
      await ctx.db.patch(operation.profileId, { archivedAt: Date.now() });
      return operation.profileId;
    }
    const name = operation.name.trim();
    if (!name || name.length > 100) throw new Error("Enter a pricing profile name up to 100 characters");
    const defaults = operation.kind === "duplicate" ? revision!.defaults : operation.defaults;
    validateEstimateDraft(defaults);
    calculateEstimate({ ...defaults, areaHundredths: defaults.areaHundredths ?? 0, laborMinutes: defaults.laborMinutes ?? 0,
      bedrooms: defaults.bedrooms ?? 0, bathHalves: defaults.bathHalves ?? 0 }, []);
    if (operation.kind !== "edit") {
      const active = await ctx.db.query("smartPricingProfiles").withIndex("by_companyId_archivedAt", q => q.eq("companyId", actor.companyId).eq("archivedAt", undefined)).take(100);
      if (active.length >= 100) throw new Error("Archive a pricing profile before creating another");
    }
    const profileId = operation.kind === "edit" ? operation.profileId : await ctx.db.insert("smartPricingProfiles", { companyId: actor.companyId });
    const currentRevisionId = await ctx.db.insert("smartPricingProfileRevisions", {
      companyId: actor.companyId, profileId, name, defaults, createdBy: userId, createdAt: Date.now(),
    });
    await ctx.db.patch(profileId, { currentRevisionId });
    return profileId;
  },
});

export const previewChange = mutation({
  args, returns: v.id("smartPricingProfiles"),
  handler: async (ctx, input): Promise<Id<"smartPricingProfiles">> => {
    await requireSmartEstimatePreview(ctx, input, "configuration");
    return ctx.runMutation(internal.mutations.smartPricingProfiles.change, input);
  },
});
