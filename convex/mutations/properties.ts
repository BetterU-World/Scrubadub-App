import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireOwner, logAudit } from "../lib/helpers";
import { requireActiveSubscription } from "../lib/subscriptionGating";

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
    beds: v.optional(v.number()),
    baths: v.optional(v.number()),
    linenCount: v.optional(v.number()),
    hasStandaloneTub: v.optional(v.boolean()),
    showerGlassDoorCount: v.optional(v.number()),
    maintenanceNotes: v.optional(v.string()),
    ownerNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    if (owner.companyId !== args.companyId) throw new Error("Not your company");
    await requireActiveSubscription(ctx, args.companyId);

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

export const bulkCreate = mutation({
  args: {
    userId: v.optional(v.id("users")),
    companyId: v.id("companies"),
    properties: v.array(
      v.object({
        name: v.string(),
        address: v.string(),
        type: v.union(
          v.literal("residential"),
          v.literal("commercial"),
          v.literal("vacation_rental"),
          v.literal("office")
        ),
        beds: v.optional(v.number()),
        baths: v.optional(v.number()),
        ownerNotes: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    if (owner.companyId !== args.companyId) throw new Error("Not your company");
    await requireActiveSubscription(ctx, args.companyId);

    let created = 0;
    const errors: Array<{ row: number; message: string }> = [];

    for (let i = 0; i < args.properties.length; i++) {
      try {
        const prop = args.properties[i];
        const propertyId = await ctx.db.insert("properties", {
          companyId: args.companyId,
          name: prop.name,
          type: prop.type,
          address: prop.address,
          amenities: [],
          beds: prop.beds,
          baths: prop.baths,
          ownerNotes: prop.ownerNotes,
          active: true,
        });

        await logAudit(ctx, {
          companyId: args.companyId,
          userId: owner._id,
          action: "create_property",
          entityType: "property",
          entityId: propertyId,
        });

        created++;
      } catch (err) {
        errors.push({
          row: i,
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return { created, errors };
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
    beds: v.optional(v.number()),
    baths: v.optional(v.number()),
    linenCount: v.optional(v.number()),
    hasStandaloneTub: v.optional(v.boolean()),
    showerGlassDoorCount: v.optional(v.number()),
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

// ── Property Inventory Item mutations (Sprint 2) ──────────────────────

const inventoryItemValidator = v.object({
  name: v.string(),
  category: v.string(),
  parLevel: v.number(),
  required: v.boolean(),
  currentQty: v.optional(v.number()),
  restockResponsibility: v.optional(v.string()),
  notes: v.optional(v.string()),
});

/** Replace the full inventory list on a property. */
export const updateInventoryItems = mutation({
  args: {
    userId: v.optional(v.id("users")),
    propertyId: v.id("properties"),
    items: v.array(inventoryItemValidator),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new Error("Property not found");
    if (property.companyId !== owner.companyId) throw new Error("Not your company");

    await ctx.db.patch(args.propertyId, { inventoryItems: args.items });

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: "update_property_inventory",
      entityType: "property",
      entityId: args.propertyId,
    });
  },
});

/** Add a single item to a property's inventory list. */
export const addInventoryItem = mutation({
  args: {
    userId: v.optional(v.id("users")),
    propertyId: v.id("properties"),
    item: inventoryItemValidator,
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new Error("Property not found");
    if (property.companyId !== owner.companyId) throw new Error("Not your company");

    if (args.item.name.trim().length === 0) throw new Error("Item name is required");
    if (args.item.parLevel < 0) throw new Error("Par level must be non-negative");

    const existing = property.inventoryItems ?? [];
    const duplicate = existing.some(
      (i) => i.name.toLowerCase() === args.item.name.trim().toLowerCase()
    );
    if (duplicate) throw new Error("Item already exists on this property");

    await ctx.db.patch(args.propertyId, {
      inventoryItems: [...existing, { ...args.item, name: args.item.name.trim() }],
    });

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: "add_inventory_item",
      entityType: "property",
      entityId: args.propertyId,
      details: args.item.name,
    });
  },
});

/** Remove a single item from a property's inventory list by name. */
export const removeInventoryItem = mutation({
  args: {
    userId: v.optional(v.id("users")),
    propertyId: v.id("properties"),
    itemName: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new Error("Property not found");
    if (property.companyId !== owner.companyId) throw new Error("Not your company");

    const existing = property.inventoryItems ?? [];
    const filtered = existing.filter(
      (i) => i.name.toLowerCase() !== args.itemName.toLowerCase()
    );
    if (filtered.length === existing.length) throw new Error("Item not found");

    await ctx.db.patch(args.propertyId, { inventoryItems: filtered });

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: "remove_inventory_item",
      entityType: "property",
      entityId: args.propertyId,
      details: args.itemName,
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
