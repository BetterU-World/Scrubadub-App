import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { logAudit } from "../lib/helpers";
import { requireOwnerSession } from "../lib/sessionAuth";
import { requireActiveSubscription } from "../lib/subscriptionGating";

export const upsert = mutation({
  args: {
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
    companyId: v.id("companies"),
    propertyId: v.id("properties"),
    enabled: v.optional(v.boolean()),
    jobType: v.optional(v.string()),
    defaultDurationMinutes: v.optional(v.number()),
    // Maps to jobs.startTime. Omit to keep current value.
    // Pass "" (empty string) to explicitly leave the job start time blank.
    // Pass a time string like "16:00" to set a specific default.
    defaultStartTime: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    if (owner.companyId !== args.companyId) throw new Error("Not your company");
    await requireActiveSubscription(ctx, args.companyId);

    // Verify property belongs to this company
    const property = await ctx.db.get(args.propertyId);
    if (!property || property.companyId !== args.companyId) {
      throw new Error("Property not found");
    }

    // Check for existing rule on this property
    const existing = await ctx.db
      .query("jobAutomationRules")
      .withIndex("by_propertyId", (q) => q.eq("propertyId", args.propertyId))
      .first();

    if (existing) {
      const updates: Record<string, unknown> = {};
      if (args.enabled !== undefined) updates.enabled = args.enabled;
      if (args.jobType !== undefined) updates.jobType = args.jobType;
      if (args.defaultDurationMinutes !== undefined) updates.defaultDurationMinutes = args.defaultDurationMinutes;
      if (args.defaultStartTime !== undefined) updates.defaultStartTime = args.defaultStartTime;

      await ctx.db.patch(existing._id, updates);

      await logAudit(ctx, {
        companyId: args.companyId,
        userId: owner._id,
        action: "update_job_automation_rule",
        entityType: "jobAutomationRule",
        entityId: existing._id,
      });

      return existing._id;
    }

    // Create new rule with safe defaults
    const ruleId = await ctx.db.insert("jobAutomationRules", {
      companyId: args.companyId,
      propertyId: args.propertyId,
      enabled: args.enabled ?? true,
      jobType: args.jobType ?? "turnover",
      defaultDurationMinutes: args.defaultDurationMinutes ?? 180,
      defaultStartTime: args.defaultStartTime ?? "16:00",
    });

    await logAudit(ctx, {
      companyId: args.companyId,
      userId: owner._id,
      action: "create_job_automation_rule",
      entityType: "jobAutomationRule",
      entityId: ruleId,
    });

    return ruleId;
  },
});
