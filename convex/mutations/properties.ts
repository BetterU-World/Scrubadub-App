import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireOwner, logAudit } from "../lib/helpers";

export const create = mutation({
  args: {
    userId: v.optional(v.id("users")),
    companyId: v.id("companies"),
    name: v.string(),
    type: v.union(
      v.literal("residential"),
      v.literal("commercial"),
      v.literal("vacation_rental"),
      v.literal("office")
    ),
    address: v.string(),
    accessInstructions: v.optional(v.string()),
    amenities: v.array(v.string()),
    towelCount: v.optional(v.number()),
    sheetSets: v.optional(v.number()),
    pillowCount: v.optional(v.number()),
    linenTypes: v.optional(v.array(v.string())),
    supplies: v.optional(v.array(v.string())),
    maintenanceNotes: v.optional(v.string()),
    ownerNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    if (owner.companyId !== args.companyId) throw new Error("Not your company");

    const { userId: _uid, ...propData } = args;
    const propertyId = await ctx.db.insert("properties", {
      ...propData,
      active: true,
    });

    await logAudit(ctx, {
      companyId: args.companyId,
      userId: owner._id,
      action: "create_property",
      entityType: "property",
      entityId: propertyId,
    });

    return propertyId;
  },
});

export const update = mutation({
  args: {
    userId: v.optional(v.id("users")),
    propertyId: v.id("properties"),
    name: v.string(),
    type: v.union(
      v.literal("residential"),
      v.literal("commercial"),
      v.literal("vacation_rental"),
      v.literal("office")
    ),
    address: v.string(),
    accessInstructions: v.optional(v.string()),
    amenities: v.array(v.string()),
    towelCount: v.optional(v.number()),
    sheetSets: v.optional(v.number()),
    pillowCount: v.optional(v.number()),
    linenTypes: v.optional(v.array(v.string())),
    supplies: v.optional(v.array(v.string())),
    maintenanceNotes: v.optional(v.string()),
    ownerNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new Error("Property not found");
    if (property.companyId !== owner.companyId) throw new Error("Not your company");

    const { propertyId, userId: _uid, ...updates } = args;
    await ctx.db.patch(propertyId, updates);

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: "update_property",
      entityType: "property",
      entityId: propertyId,
    });
  },
});

export const toggleActive = mutation({
  args: { propertyId: v.id("properties"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new Error("Property not found");
    if (property.companyId !== owner.companyId) throw new Error("Not your company");

    await ctx.db.patch(args.propertyId, { active: !property.active });

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: property.active ? "deactivate_property" : "activate_property",
      entityType: "property",
      entityId: args.propertyId,
    });
  },
});
