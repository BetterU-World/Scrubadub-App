import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { getSessionUser } from "../lib/auth";
import { FALLBACK_SERVICE_AGREEMENT_TEMPLATE } from "../lib/documentMergeFields";

const documentTypeValidator = v.union(
  v.literal("service_agreement"),
  v.literal("proposal"),
  v.literal("employee_agreement"),
  v.literal("nda"),
  v.literal("safety_policy"),
  v.literal("other")
);

const templateSourceValidator = v.union(
  v.literal("scrub_default"),
  v.literal("scrub_editor"),
  v.literal("uploaded_pdf")
);

async function requireOwnerCompany(ctx: any, userId: any) {
  const user = await getSessionUser(ctx, userId);
  if (user.role !== "owner" || !user.companyId) {
    throw new Error("Owner access required");
  }
  return user;
}

function cleanRequired(value: string, fallback: string, max: number) {
  return value.trim().slice(0, max) || fallback;
}

async function clearDefaultTemplates(ctx: any, companyId: any, type: string, keepId?: string) {
  const templates = await (ctx.db as any)
    .query("documentTemplates")
    .withIndex("by_company_type_default", (q: any) =>
      q.eq("companyId", companyId).eq("type", type).eq("isDefault", true)
    )
    .collect();

  await Promise.all(
    templates
      .filter((template: any) => String(template._id) !== String(keepId))
      .map((template: any) =>
        (ctx.db as any).patch(template._id, {
          isDefault: false,
          updatedAt: Date.now(),
        })
      )
  );
}

export const create = mutation({
  args: {
    userId: v.id("users"),
    type: documentTypeValidator,
    name: v.string(),
    body: v.string(),
    isDefault: v.optional(v.boolean()),
    source: v.optional(templateSourceValidator),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.userId);
    const now = Date.now();

    if (args.isDefault) {
      await clearDefaultTemplates(ctx, owner.companyId, args.type);
    }

    return await (ctx.db as any).insert("documentTemplates", {
      companyId: owner.companyId,
      type: args.type,
      name: cleanRequired(args.name, "Document Template", 200),
      body: cleanRequired(args.body, "", 20000),
      isDefault: args.isDefault ?? false,
      source: args.source ?? "scrub_editor",
      status: "active",
      version: 1,
      mergeFieldSet: args.type,
      createdByUserId: owner._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    userId: v.id("users"),
    templateId: v.id("documentTemplates"),
    name: v.string(),
    body: v.string(),
    isDefault: v.optional(v.boolean()),
    source: v.optional(templateSourceValidator),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.userId);
    const template = await (ctx.db as any).get(args.templateId);
    if (!template) throw new Error("Document template not found");
    if (template.companyId !== owner.companyId) throw new Error("Access denied");

    if (args.isDefault) {
      await clearDefaultTemplates(ctx, owner.companyId, template.type, String(template._id));
    }

    await (ctx.db as any).patch(args.templateId, {
      name: cleanRequired(args.name, "Document Template", 200),
      body: cleanRequired(args.body, "", 20000),
      isDefault: args.isDefault ?? false,
      source: args.source ?? template.source ?? "scrub_editor",
      status: template.status ?? "active",
      version: (template.version ?? 1) + 1,
      updatedAt: Date.now(),
    });
  },
});

export const setDefault = mutation({
  args: {
    userId: v.id("users"),
    templateId: v.id("documentTemplates"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.userId);
    const template = await (ctx.db as any).get(args.templateId);
    if (!template) throw new Error("Document template not found");
    if (template.companyId !== owner.companyId) throw new Error("Access denied");

    await clearDefaultTemplates(ctx, owner.companyId, template.type, String(template._id));
    await (ctx.db as any).patch(args.templateId, {
      isDefault: true,
      status: template.status ?? "active",
      updatedAt: Date.now(),
    });
  },
});

export const restoreScrubDefault = mutation({
  args: {
    userId: v.id("users"),
    type: documentTypeValidator,
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.userId);
    if (args.type !== "service_agreement") {
      throw new Error("SCRUB defaults are only available for service agreements in V1");
    }

    await clearDefaultTemplates(ctx, owner.companyId, args.type);
    const now = Date.now();
    return await (ctx.db as any).insert("documentTemplates", {
      companyId: owner.companyId,
      type: args.type,
      name: "SCRUB Service Agreement",
      body: FALLBACK_SERVICE_AGREEMENT_TEMPLATE,
      isDefault: true,
      source: "scrub_default",
      status: "active",
      version: 1,
      mergeFieldSet: args.type,
      createdByUserId: owner._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});
