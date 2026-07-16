import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { logAudit } from "../lib/helpers";
import { requireOwnerManagerSession, requireOwnerSession } from "../lib/sessionAuth";
import { requireActiveSubscription } from "../lib/subscriptionGating";
import { bedroomsValidator, deriveBedroomAggregates, normalizeBedrooms } from "../lib/propertyBedrooms";

export const create = mutation({
  args: {
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
    companyId: v.id("companies"),
    clientRelationshipId: v.optional(v.id("clientRelationships")),
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
    bedrooms: v.optional(bedroomsValidator),
    baths: v.optional(v.number()),
    linenCount: v.optional(v.number()),
    hasStandaloneTub: v.optional(v.boolean()),
    showerGlassDoorCount: v.optional(v.number()),
    maintenanceNotes: v.optional(v.string()),
    ownerNotes: v.optional(v.string()),
    squareFootage: v.optional(v.number()),
    trashCanCount: v.optional(v.number()),
    restroomCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    if (owner.companyId !== args.companyId) throw new Error("Not your company");
    await requireActiveSubscription(ctx, args.companyId);
    if (args.clientRelationshipId) {
      const relationship = await ctx.db.get(args.clientRelationshipId);
      if (!relationship || relationship.companyId !== args.companyId) {
        throw new Error("Client relationship must belong to your company");
      }
    }

    const { userId: _uid, sessionToken: _sessionToken, ...propData } = args;
    const bedrooms = normalizeBedrooms(args.bedrooms);
    const propertyId = await ctx.db.insert("properties", {
      ...propData,
      bedrooms,
      ...(bedrooms ? deriveBedroomAggregates(bedrooms) : {}),
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
    sessionToken: v.string(),
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
        amenities: v.optional(v.array(v.string())),
        accessInstructions: v.optional(v.string()),
        pillowCount: v.optional(v.number()),
        maintenanceNotes: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
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
          amenities: prop.amenities ?? [],
          beds: prop.beds,
          baths: prop.baths,
          ownerNotes: prop.ownerNotes,
          accessInstructions: prop.accessInstructions,
          pillowCount: prop.pillowCount,
          maintenanceNotes: prop.maintenanceNotes,
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
    sessionToken: v.string(),
    propertyId: v.id("properties"),
    clientRelationshipId: v.optional(v.id("clientRelationships")),
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
    bedrooms: v.optional(bedroomsValidator),
    baths: v.optional(v.number()),
    linenCount: v.optional(v.number()),
    hasStandaloneTub: v.optional(v.boolean()),
    showerGlassDoorCount: v.optional(v.number()),
    maintenanceNotes: v.optional(v.string()),
    ownerNotes: v.optional(v.string()),
    squareFootage: v.optional(v.number()),
    trashCanCount: v.optional(v.number()),
    restroomCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerManagerSession(ctx, args.sessionToken, args.userId);
    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new Error("Property not found");
    if (property.companyId !== owner.companyId) throw new Error("Not your company");
    if (args.clientRelationshipId) {
      const relationship = await ctx.db.get(args.clientRelationshipId);
      if (!relationship || relationship.companyId !== owner.companyId) {
        throw new Error("Client relationship must belong to your company");
      }
    }

    const { propertyId, userId: _uid, sessionToken: _sessionToken, ...updates } = args;
    const bedrooms = normalizeBedrooms(args.bedrooms);
    await ctx.db.patch(propertyId, {
      ...updates,
      bedrooms,
      ...(bedrooms ? deriveBedroomAggregates(bedrooms) : {}),
    });

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: "update_property",
      entityType: "property",
      entityId: propertyId,
    });
  },
});

/** Update only canonical property facts exposed by a linked walkthrough. */
export const updateWalkthroughFacts = mutation({
  args: {
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
    propertyId: v.id("properties"),
    address: v.string(),
    squareFootage: v.optional(v.number()),
    beds: v.optional(v.number()),
    baths: v.optional(v.number()),
    amenities: v.array(v.string()),
    accessInstructions: v.optional(v.string()),
    pillowCount: v.optional(v.number()),
    sheetSets: v.optional(v.number()),
    towelCount: v.optional(v.number()),
    restroomCount: v.optional(v.number()),
    trashCanCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerManagerSession(ctx, args.sessionToken, args.userId);
    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new Error("Property not found");
    if (property.companyId !== owner.companyId) throw new Error("Not your company");

    const address = args.address.trim();
    if (!address) throw new Error("Address is required");
    const numericFacts = [
      args.squareFootage, args.beds, args.baths, args.pillowCount, args.sheetSets,
      args.towelCount, args.restroomCount, args.trashCanCount,
    ];
    if (numericFacts.some((value) => value !== undefined && (!Number.isFinite(value) || value < 0))) {
      throw new Error("Property counts must be non-negative numbers");
    }

    const { propertyId, userId: _uid, sessionToken: _sessionToken, ...updates } = args;
    await ctx.db.patch(propertyId, {
      ...updates,
      address,
      accessInstructions: args.accessInstructions?.trim() || undefined,
      amenities: Array.from(new Set(args.amenities.map((value) => value.trim()).filter(Boolean))),
    });

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: "update_property",
      entityType: "property",
      entityId: propertyId,
      details: "Updated from linked walkthrough",
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
    sessionToken: v.string(),
    propertyId: v.id("properties"),
    items: v.array(inventoryItemValidator),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
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
    sessionToken: v.string(),
    propertyId: v.id("properties"),
    item: inventoryItemValidator,
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
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
    sessionToken: v.string(),
    propertyId: v.id("properties"),
    itemName: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
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
  args: { propertyId: v.id("properties"), userId: v.optional(v.id("users")), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
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
