import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { canManageBusinessConfiguration } from "../lib/auth";
import { getCompanyAddOnPreset } from "../lib/companyAddOnPresets";
import { validateCompanyAddOnInput } from "../lib/companyAddOnValidation";
import { logAudit } from "../lib/helpers";
import { requireOwnerManagerSession } from "../lib/sessionAuth";

const pricingMethod = v.union(v.literal("flat"), v.literal("starting_at"), v.literal("per_unit"));
const editableArgs = {
  name: v.string(), description: v.optional(v.string()), pricingMethod, priceCents: v.number(), unitLabel: v.optional(v.string()),
  estimatedDurationMinutes: v.optional(v.number()), internalNotes: v.optional(v.string()), isActive: v.boolean(), isPublic: v.boolean(),
};

async function requireCatalogManager(ctx: any, sessionToken: string, claimedUserId?: any) {
  const user = await requireOwnerManagerSession(ctx, sessionToken, claimedUserId);
  if (!canManageBusinessConfiguration(user)) throw new Error("Business configuration permission required");
  return user;
}

async function recordsForCompany(ctx: any, companyId: any) {
  return await ctx.db.query("companyAddOns").withIndex("by_companyId", (q: any) => q.eq("companyId", companyId)).collect();
}

async function nextDisplayOrder(ctx: any, companyId: any) {
  const records = (await recordsForCompany(ctx, companyId)).filter((record: any) => record.archivedAt === undefined);
  return records.length ? Math.max(...records.map((record: any) => record.displayOrder)) + 1 : 0;
}

async function ownedRecord(ctx: any, user: any, addOnId: any) {
  const record = await ctx.db.get(addOnId);
  if (!record || record.companyId !== user.companyId) throw new Error("Add-on not found or access denied");
  return record;
}

async function audit(ctx: any, user: any, addOnId: any, action: string, details?: Record<string, unknown>) {
  await logAudit(ctx, { companyId: user.companyId, userId: user._id, action, entityType: "company_add_on", entityId: String(addOnId), details: details ? JSON.stringify(details) : undefined });
}

export const create = mutation({
  args: { userId: v.optional(v.id("users")), sessionToken: v.string(), ...editableArgs },
  handler: async (ctx, args) => {
    const user = await requireCatalogManager(ctx, args.sessionToken, args.userId);
    const values = validateCompanyAddOnInput(args);
    const now = Date.now();
    const id = await ctx.db.insert("companyAddOns", { companyId: user.companyId, ...values, displayOrder: await nextDisplayOrder(ctx, user.companyId), createdByUserId: user._id, createdAt: now, updatedAt: now });
    await audit(ctx, user, id, "create_company_add_on");
    return id;
  },
});

export const update = mutation({
  args: { addOnId: v.id("companyAddOns"), userId: v.optional(v.id("users")), sessionToken: v.string(), ...editableArgs },
  handler: async (ctx, args) => {
    const user = await requireCatalogManager(ctx, args.sessionToken, args.userId);
    const record = await ownedRecord(ctx, user, args.addOnId);
    if (record.archivedAt !== undefined) throw new Error("Restore the add-on before editing it");
    const values = validateCompanyAddOnInput(args);
    await ctx.db.patch(args.addOnId, { ...values, updatedAt: Date.now() });
    await audit(ctx, user, args.addOnId, "update_company_add_on", { fields: Object.keys(values).filter((key) => (record as any)[key] !== (values as any)[key]) });
    if (record.priceCents !== values.priceCents || record.pricingMethod !== values.pricingMethod || record.unitLabel !== values.unitLabel) await audit(ctx, user, args.addOnId, "change_company_add_on_price");
    if (record.isActive !== values.isActive) await audit(ctx, user, args.addOnId, "change_company_add_on_active", { active: values.isActive });
    if (record.isPublic !== values.isPublic) await audit(ctx, user, args.addOnId, "change_company_add_on_visibility", { public: values.isPublic });
    return args.addOnId;
  },
});

export const enablePreset = mutation({
  args: { presetKey: v.string(), locale: v.union(v.literal("en"), v.literal("es")), pricingMethod, priceCents: v.number(), unitLabel: v.optional(v.string()), estimatedDurationMinutes: v.optional(v.number()), userId: v.optional(v.id("users")), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCatalogManager(ctx, args.sessionToken, args.userId);
    const preset = getCompanyAddOnPreset(args.presetKey);
    if (!preset) throw new Error("Unknown or retired preset");
    const existing = await ctx.db.query("companyAddOns").withIndex("by_companyId_presetKey", (q: any) => q.eq("companyId", user.companyId).eq("presetKey", preset.presetKey)).first();
    if (existing) {
      if (existing.archivedAt === undefined) return { addOnId: existing._id, status: "already_enabled" as const };
      await ctx.db.patch(existing._id, { archivedAt: undefined, archivedByUserId: undefined, isActive: true, isPublic: false, displayOrder: await nextDisplayOrder(ctx, user.companyId), updatedAt: Date.now() });
      await audit(ctx, user, existing._id, "restore_company_add_on", { source: "preset_activation" });
      return { addOnId: existing._id, status: "restored" as const };
    }
    const localized = preset[args.locale];
    const values = validateCompanyAddOnInput({ name: localized.name, description: localized.description, pricingMethod: args.pricingMethod, priceCents: args.priceCents, unitLabel: args.unitLabel, estimatedDurationMinutes: args.estimatedDurationMinutes, isActive: true, isPublic: false });
    const now = Date.now();
    const id = await ctx.db.insert("companyAddOns", { companyId: user.companyId, ...values, presetKey: preset.presetKey, displayOrder: await nextDisplayOrder(ctx, user.companyId), createdByUserId: user._id, createdAt: now, updatedAt: now });
    await audit(ctx, user, id, "enable_company_add_on_preset", { presetKey: preset.presetKey, locale: args.locale });
    return { addOnId: id, status: "created" as const };
  },
});

export const archive = mutation({
  args: { addOnId: v.id("companyAddOns"), userId: v.optional(v.id("users")), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCatalogManager(ctx, args.sessionToken, args.userId);
    const record = await ownedRecord(ctx, user, args.addOnId);
    if (record.archivedAt !== undefined) return args.addOnId;
    await ctx.db.patch(args.addOnId, { archivedAt: Date.now(), archivedByUserId: user._id, isActive: false, isPublic: false, updatedAt: Date.now() });
    await audit(ctx, user, args.addOnId, "archive_company_add_on");
    return args.addOnId;
  },
});

export const restore = mutation({
  args: { addOnId: v.id("companyAddOns"), userId: v.optional(v.id("users")), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCatalogManager(ctx, args.sessionToken, args.userId);
    const record = await ownedRecord(ctx, user, args.addOnId);
    if (record.archivedAt === undefined) return args.addOnId;
    await ctx.db.patch(args.addOnId, { archivedAt: undefined, archivedByUserId: undefined, isActive: true, isPublic: false, displayOrder: await nextDisplayOrder(ctx, user.companyId), updatedAt: Date.now() });
    await audit(ctx, user, args.addOnId, "restore_company_add_on");
    return args.addOnId;
  },
});

export const reorder = mutation({
  args: { orderedIds: v.array(v.id("companyAddOns")), userId: v.optional(v.id("users")), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCatalogManager(ctx, args.sessionToken, args.userId);
    if (new Set(args.orderedIds.map(String)).size !== args.orderedIds.length) throw new Error("Duplicate add-on IDs are not allowed");
    const records = (await recordsForCompany(ctx, user.companyId)).filter((record: any) => record.archivedAt === undefined);
    if (args.orderedIds.length !== records.length) throw new Error("Reorder must include every non-archived add-on");
    const expected = new Set(records.map((record: any) => String(record._id)));
    for (const id of args.orderedIds) if (!expected.has(String(id))) throw new Error("Reorder contains a foreign or archived add-on");
    const now = Date.now();
    await Promise.all(args.orderedIds.map((id, index) => ctx.db.patch(id, { displayOrder: index, updatedAt: now })));
    await audit(ctx, user, user.companyId, "reorder_company_add_ons", { count: args.orderedIds.length });
    return args.orderedIds;
  },
});
