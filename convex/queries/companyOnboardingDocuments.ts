import { query } from "../_generated/server";
import { v } from "convex/values";
import { assertOwnerRole, getSessionUser, isWorkerRole } from "../lib/auth";
import {
  STANDARD_COMPANY_ONBOARDING_DOCUMENTS,
  isVisibleToWorkerRole,
} from "../lib/companyOnboardingDocuments";

function mergeStandardDocuments(documents: any[]) {
  const byKey = new Map(documents.map((document) => [document.documentKey, document]));
  const merged = STANDARD_COMPANY_ONBOARDING_DOCUMENTS.map((standard) => {
    const existing = byKey.get(standard.documentKey);
    if (!existing) {
      return {
        ...standard,
        _id: null,
        storageId: null,
        status: "active",
        createdAt: null,
        updatedAt: null,
        isStandard: true,
      };
    }

    return {
      ...standard,
      ...existing,
      description: existing.description ?? standard.description,
      isStandard: true,
    };
  });

  const standardKeys = new Set(STANDARD_COMPANY_ONBOARDING_DOCUMENTS.map((document) => document.documentKey));
  const custom = documents
    .filter((document) => !standardKeys.has(document.documentKey))
    .map((document) => ({ ...document, isStandard: false }));

  return [...merged, ...custom];
}

async function withUrls(ctx: any, documents: any[]) {
  return await Promise.all(
    documents.map(async (document) => ({
      ...document,
      url: document.storageId ? await ctx.storage.getUrl(document.storageId) : null,
    }))
  );
}

export const listForOwner = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const owner = await assertOwnerRole(ctx, args.userId);
    const db: any = ctx.db;
    const documents = await db
      .query("companyOnboardingDocuments")
      .withIndex("by_companyId", (q: any) => q.eq("companyId", owner.companyId))
      .collect();

    return await withUrls(ctx, mergeStandardDocuments(documents));
  },
});

export const listForWorker = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);
    if (!user.companyId || !isWorkerRole(user.role)) {
      throw new Error("Worker access required");
    }

    const db: any = ctx.db;
    const documents = await db
      .query("companyOnboardingDocuments")
      .withIndex("by_companyId", (q: any) => q.eq("companyId", user.companyId))
      .collect();

    const visible = mergeStandardDocuments(documents).filter((document) =>
      document.status === "active" &&
      isVisibleToWorkerRole(document.roleVisibility, user.role)
    );

    return await withUrls(ctx, visible);
  },
});
