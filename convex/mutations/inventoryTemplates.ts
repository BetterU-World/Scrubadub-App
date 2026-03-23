import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireOwner, logAudit } from "../lib/helpers";
import { requireActiveSubscription } from "../lib/subscriptionGating";

const inventoryItemValidator = v.object({
  name: v.string(),
  category: v.string(),
  parLevel: v.number(),
  required: v.boolean(),
  restockResponsibility: v.optional(v.string()),
  notes: v.optional(v.string()),
});

export const create = mutation({
  args: {
    userId: v.optional(v.id("users")),
    companyId: v.id("companies"),
    name: v.string(),
    items: v.array(inventoryItemValidator),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    if (owner.companyId !== args.companyId) throw new Error("Not your company");
    await requireActiveSubscription(ctx, args.companyId);

    if (args.name.trim().length === 0) throw new Error("Template name is required");
    if (args.items.length === 0) throw new Error("Template must have at least one item");

    // If marking as default, clear existing default
    if (args.isDefault) {
      const existing = await ctx.db
        .query("inventoryTemplates")
        .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
        .collect();
      for (const tmpl of existing) {
        if (tmpl.isDefault) {
          await ctx.db.patch(tmpl._id, { isDefault: false });
        }
      }
    }

    const templateId = await ctx.db.insert("inventoryTemplates", {
      companyId: args.companyId,
      name: args.name.trim(),
      items: args.items,
      isDefault: args.isDefault ?? false,
      createdAt: Date.now(),
    });

    await logAudit(ctx, {
      companyId: args.companyId,
      userId: owner._id,
      action: "create_inventory_template",
      entityType: "inventoryTemplate",
      entityId: templateId,
    });

    return templateId;
  },
});

export const update = mutation({
  args: {
    userId: v.optional(v.id("users")),
    templateId: v.id("inventoryTemplates"),
    name: v.optional(v.string()),
    items: v.optional(v.array(inventoryItemValidator)),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Template not found");
    if (template.companyId !== owner.companyId) throw new Error("Not your company");

    const updates: Record<string, unknown> = {};
    if (args.name !== undefined) {
      if (args.name.trim().length === 0) throw new Error("Template name is required");
      updates.name = args.name.trim();
    }
    if (args.items !== undefined) {
      if (args.items.length === 0) throw new Error("Template must have at least one item");
      updates.items = args.items;
    }
    if (args.isDefault !== undefined) {
      updates.isDefault = args.isDefault;
      // If marking as default, clear existing default
      if (args.isDefault) {
        const existing = await ctx.db
          .query("inventoryTemplates")
          .withIndex("by_companyId", (q) => q.eq("companyId", template.companyId))
          .collect();
        for (const tmpl of existing) {
          if (tmpl._id !== args.templateId && tmpl.isDefault) {
            await ctx.db.patch(tmpl._id, { isDefault: false });
          }
        }
      }
    }

    await ctx.db.patch(args.templateId, updates);

    await logAudit(ctx, {
      companyId: template.companyId,
      userId: owner._id,
      action: "update_inventory_template",
      entityType: "inventoryTemplate",
      entityId: args.templateId,
    });
  },
});

export const remove = mutation({
  args: {
    userId: v.optional(v.id("users")),
    templateId: v.id("inventoryTemplates"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Template not found");
    if (template.companyId !== owner.companyId) throw new Error("Not your company");

    await ctx.db.delete(args.templateId);

    await logAudit(ctx, {
      companyId: template.companyId,
      userId: owner._id,
      action: "delete_inventory_template",
      entityType: "inventoryTemplate",
      entityId: args.templateId,
    });
  },
});

export const applyToProperty = mutation({
  args: {
    userId: v.optional(v.id("users")),
    templateId: v.id("inventoryTemplates"),
    propertyId: v.id("properties"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Template not found");
    if (template.companyId !== owner.companyId) throw new Error("Not your company");

    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new Error("Property not found");
    if (property.companyId !== owner.companyId) throw new Error("Not your company");

    // Copy template items to property (preserves existing currentQty if names match)
    const existingItems = property.inventoryItems ?? [];
    const existingByName = new Map(existingItems.map((item) => [item.name, item]));

    const mergedItems = template.items.map((templateItem) => {
      const existing = existingByName.get(templateItem.name);
      return {
        name: templateItem.name,
        category: templateItem.category,
        parLevel: templateItem.parLevel,
        required: templateItem.required,
        restockResponsibility: templateItem.restockResponsibility,
        notes: templateItem.notes,
        // Preserve existing runtime data if item existed before
        currentQty: existing?.currentQty,
        lastCheckedAt: existing?.lastCheckedAt,
        lastCheckedBy: existing?.lastCheckedBy,
      };
    });

    await ctx.db.patch(args.propertyId, {
      inventoryItems: mergedItems,
      inventoryTemplateId: args.templateId,
    });

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: "apply_inventory_template",
      entityType: "property",
      entityId: args.propertyId,
      details: `Applied template "${template.name}"`,
    });
  },
});
