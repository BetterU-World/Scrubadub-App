import { v, type Infer } from "convex/values";

export { PDF_INSPECTOR, PDF_LIMITS, PDF_POLICY } from "../../packages/frontend/src/lib/micrositePdfContract";
export const pdfJobStatus = v.union(v.literal("checking"), v.literal("passed"), v.literal("rejected"), v.literal("unavailable"));
export const resourceEntryId = /^[a-zA-Z0-9_-]{1,64}$/;
export const micrositeResources = v.array(v.object({
  id: v.string(), resourceId: v.id("companyResources"), enabled: v.boolean(),
  title: v.string(), description: v.string(), approval: v.optional(v.string()),
}));
export const publicResources = v.array(v.object({
  id: v.string(), title: v.string(), description: v.string(), bytes: v.number(), url: v.optional(v.string()),
}));
export type ResourceEntry = Infer<typeof micrositeResources>[number];
export type PublicResource = Infer<typeof publicResources>[number];

export const publicDesignation = v.object({
  storageId: v.id("_storage"), key: v.string(), changesAt: v.number(),
  policy: v.string(), inspector: v.string(), approval: v.optional(v.string()),
});
