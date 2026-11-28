import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { miniSiteSectionEnabled } from "./miniSiteSections";
import { PDF_INSPECTOR, PDF_LIMITS, PDF_POLICY, resourceEntryId, type PublicResource, type ResourceEntry } from "./micrositeResourcesModel";

export function eligibleResource(resource: Doc<"companyResources"> | null, companyId: Id<"companies">): resource is Doc<"companyResources"> {
  return !!resource && resource.companyId === companyId && resource.status === "active" &&
    resource.mimeType === "application/pdf" && resource.sizeBytes > 0 && resource.sizeBytes <= PDF_LIMITS.bytes;
}

export function fileInspection(ctx: Pick<QueryCtx, "db">, resource: Doc<"companyResources">) {
  return ctx.db.query("micrositePdfInspections").withIndex("by_version", (q) => q.eq("resourceId", resource._id)
    .eq("storageId", resource.storageId).eq("policy", PDF_POLICY).eq("inspector", PDF_INSPECTOR)).unique();
}

export function currentDesignation(resource: Doc<"companyResources">) {
  const designation = resource.publicDesignation;
  return designation?.storageId === resource.storageId && designation.policy === PDF_POLICY &&
    designation.inspector === PDF_INSPECTOR ? designation : undefined;
}

export async function approvedResource(ctx: Pick<QueryCtx, "db">, companyId: Id<"companies">, entry: ResourceEntry) {
  if (!entry.approval) return null;
  const resource = await ctx.db.get(entry.resourceId);
  if (!eligibleResource(resource, companyId) || currentDesignation(resource)?.approval !== entry.approval ||
    (await fileInspection(ctx, resource))?.status !== "passed") return null;
  const file = await ctx.db.system.get("_storage", resource.storageId);
  return file?.size === resource.sizeBytes ? resource : null;
}

export async function validateResourceEntries(ctx: Pick<QueryCtx, "db">, companyId: Id<"companies">, entries: ResourceEntry[], previous: ResourceEntry[] = []) {
  if (entries.length > PDF_LIMITS.entries) throw new Error("Too many public resources.");
  const ids = new Set<string>();
  const resources = new Set<string>();
  for (const entry of entries) {
    if (!resourceEntryId.test(entry.id) || ids.has(entry.id) || resources.has(entry.resourceId) ||
      !entry.title.trim() || Array.from(entry.title).length > PDF_LIMITS.title ||
      Array.from(entry.description).length > PDF_LIMITS.description) throw new Error("Invalid public resource entry.");
    ids.add(entry.id);
    resources.add(entry.resourceId);
    const old = previous.find(({ id }) => id === entry.id);
    if (old?.resourceId === entry.resourceId && old?.approval === entry.approval) continue;
    if (!eligibleResource(await ctx.db.get(entry.resourceId), companyId) ||
      (entry.approval && !await approvedResource(ctx, companyId, entry))) throw new Error("Resource or approval unavailable.");
  }
}

export async function projectedResources(ctx: Pick<QueryCtx, "db">, site: Doc<"companySites">): Promise<PublicResource[]> {
  if (site.mediaDeliverySuspended || !miniSiteSectionEnabled(site.sections, "resources")) return [];
  const origin = resourceOrigin();
  if (!origin) return [];
  const resources = await Promise.all((site.resources ?? []).filter(({ enabled }) => enabled).map(async (entry) => {
    const resource = await approvedResource(ctx, site.companyId, entry);
    return resource && { id: entry.id, title: entry.title, description: entry.description, bytes: resource.sizeBytes,
      url: `${origin}/microsite-resource/${site.slug}/${entry.id}/${entry.approval}` };
  }));
  return resources.filter((resource) => resource !== null);
}

function resourceOrigin() {
  try {
    const origin = new URL(process.env.CONVEX_SITE_URL ?? "");
    if (origin.protocol === "https:" || (origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))) return origin.origin;
  } catch { /* Fail closed without a valid site origin. */ }
}
