import { v, type Infer } from "convex/values";

export const PDF_POLICY = "static-pdf-v1";
export const PDF_INSPECTOR = "qpdf-12.4.2";
export const PDF_LIMITS = {
  bytes: 10 * 1024 * 1024, entries: 10, title: 100, description: 320,
  companyHourly: 10, daily: 250, concurrent: 3, attempts: 2,
  leaseMs: 120_000, downloadBytesHourly: 128 * 1024 * 1024,
} as const;
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
