import { v, type Infer } from "convex/values";
import { internalAction, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireOwnerSession } from "./lib/sessionAuth";
import { checkRateLimit } from "./lib/rateLimit";
import { approvedResource, currentDesignation, eligibleResource, fileInspection } from "./lib/micrositeResources";
import { miniSiteSectionEnabled } from "./lib/miniSiteSections";
import { isMiniSitePublished, validMiniSiteSlug } from "./lib/miniSiteSeo";
import { PDF_INSPECTOR, PDF_LIMITS, PDF_POLICY, resourceEntryId } from "./lib/micrositeResourcesModel";

const resourceId = v.id("companyResources");
const jobId = v.id("micrositePdfInspections");
const outcome = v.union(v.literal("passed"), v.literal("rejected"), v.literal("unavailable"));
const staffArgs = { sessionToken: v.string(), resourceId };

export const list = query({
  args: { sessionToken: v.string(), selected: v.optional(v.array(resourceId)) },
  returns: v.array(v.object({
    id: resourceId, title: v.string(), filename: v.string(), mime: v.string(), bytes: v.number(),
    eligible: v.boolean(), designated: v.boolean(), canRetry: v.boolean(),
    version: v.optional(v.string()), approval: v.optional(v.string()),
    state: v.union(v.literal("unchecked"), v.literal("checking"), outcome),
  })),
  handler: async (ctx, { sessionToken, selected }) => {
    const owner = await requireOwnerSession(ctx, sessionToken);
    const rows = await ctx.db.query("companyResources").withIndex("by_company_status_updated",
      (q) => q.eq("companyId", owner.companyId).eq("status", "active")).order("desc").take(200);
    const listed = new Set(rows.map(({ _id }) => _id));
    for (const id of new Set(selected?.slice(0, PDF_LIMITS.entries))) {
      if (listed.has(id)) continue;
      const document = await ctx.db.get(id);
      if (document?.companyId === owner.companyId) rows.push(document);
    }
    return Promise.all(rows.map(async (resource) => {
      const eligible = eligibleResource(resource, owner.companyId);
      const designated = eligible && !!currentDesignation(resource);
      const inspection = designated ? await fileInspection(ctx, resource) : null;
      const state = inspection?.status === "checking" && inspection.leaseUntil <= Date.now()
        ? "unavailable" as const : inspection?.status ?? "unchecked" as const;
      return {
        id: resource._id, title: resource.title, filename: resource.originalFileName, mime: resource.mimeType,
        bytes: resource.sizeBytes, eligible, designated, state, canRetry: !inspection || inspection.attempts < PDF_LIMITS.attempts,
        ...(designated && state === "passed" ? { version: resource.publicDesignation?.key, approval: resource.publicDesignation?.approval } : {}),
      };
    }));
  },
});

export const requestInspection = mutation({
  args: { ...staffArgs, designate: v.literal(true) }, returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken);
    const resource = await ctx.db.get(args.resourceId);
    if (!eligibleResource(resource, owner.companyId) ||
      (await ctx.db.system.get("_storage", resource.storageId))?.size !== resource.sizeBytes) throw new Error("Choose an eligible company PDF.");
    const now = Date.now();
    if (!currentDesignation(resource)) {
      await ctx.db.patch(resource._id, { publicDesignation: { storageId: resource.storageId, key: crypto.randomUUID(),
        changesAt: now, policy: PDF_POLICY, inspector: PDF_INSPECTOR } });
    }
    const current = await fileInspection(ctx, resource);
    if (current?.status === "passed" || current?.status === "rejected" ||
      (current?.status === "checking" && current.leaseUntil > now)) return null;
    if ((current?.attempts ?? 0) >= PDF_LIMITS.attempts) throw new Error("Document check retry limit reached.");
    const usage = await ctx.db.query("micrositePdfUsage").withIndex("by_key", (q) => q.eq("key", "global")).unique();
    const day = Math.floor(now / 86_400_000);
    const launches = (usage?.day === day ? usage.launches : 0) + 1;
    const active = await ctx.db.query("micrositePdfInspections").withIndex("by_status_lease",
      (q) => q.eq("status", "checking").gt("leaseUntil", now)).take(PDF_LIMITS.concurrent);
    if (usage?.suspended || launches > PDF_LIMITS.daily || active.length >= PDF_LIMITS.concurrent) throw new Error("Document checks are temporarily unavailable.");
    await checkRateLimit(ctx, { key: `public-pdf:${owner.companyId}`, limit: PDF_LIMITS.companyHourly, windowMs: 3_600_000 });
    if (usage) await ctx.db.patch(usage._id, { day, launches });
    else await ctx.db.insert("micrositePdfUsage", { key: "global", day, launches, suspended: false });
    const nonce = crypto.randomUUID();
    const run = { status: "checking" as const, nonce, leaseUntil: now + PDF_LIMITS.leaseMs, claimed: false,
      checkedAt: now, attempts: (current?.attempts ?? 0) + 1 };
    const id = current?._id ?? await ctx.db.insert("micrositePdfInspections", {
      ...run, companyId: owner.companyId, resourceId: resource._id, storageId: resource.storageId,
      policy: PDF_POLICY, inspector: PDF_INSPECTOR,
    });
    if (current) await ctx.db.patch(id, run);
    await ctx.scheduler.runAfter(0, internal.micrositeResources.inspect, { jobId: id, nonce });
    await ctx.scheduler.runAfter(PDF_LIMITS.leaseMs, internal.micrositeResources.expireInspection, { jobId: id, nonce });
    return null;
  },
});

export const approve = mutation({
  args: { ...staffArgs, acknowledged: v.literal(true), expectedVersion: v.string() }, returns: v.string(),
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken);
    const resource = await ctx.db.get(args.resourceId);
    const designation = resource && currentDesignation(resource);
    if (!eligibleResource(resource, owner.companyId) || designation?.key !== args.expectedVersion ||
      (await fileInspection(ctx, resource))?.status !== "passed" ||
      (await ctx.db.system.get("_storage", resource.storageId))?.size !== resource.sizeBytes) throw new Error("Check the current document before approving it.");
    if (designation.approval) return designation.approval;
    const approval = crypto.randomUUID();
    await ctx.db.patch(resource._id, { publicDesignation: { ...designation, approval } });
    return approval;
  },
});

export const revokeDesignation = mutation({
  args: staffArgs, returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken);
    const resource = await ctx.db.get(args.resourceId);
    if (!resource || resource.companyId !== owner.companyId) throw new Error("Resource unavailable.");
    await ctx.db.patch(resource._id, { publicDesignation: undefined });
    return null;
  },
});

export const claimTransfer = internalMutation({
  args: { jobId, nonce: v.string() },
  returns: v.union(v.null(), v.object({ storageId: v.id("_storage"), bytes: v.number() })),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.nonce !== args.nonce || job.status !== "checking" || job.claimed || job.leaseUntil <= Date.now() ||
      job.policy !== PDF_POLICY || job.inspector !== PDF_INSPECTOR) return null;
    const usage = await ctx.db.query("micrositePdfUsage").withIndex("by_key", (q) => q.eq("key", "global")).unique();
    const resource = await ctx.db.get(job.resourceId);
    if (usage?.suspended || !eligibleResource(resource, job.companyId) || resource.storageId !== job.storageId ||
      !currentDesignation(resource) ||
      (await ctx.db.system.get("_storage", job.storageId))?.size !== resource.sizeBytes) return null;
    await ctx.db.patch(job._id, { claimed: true });
    return { storageId: job.storageId, bytes: resource.sizeBytes };
  },
});

export const finish = internalMutation({
  args: { jobId, nonce: v.string(), status: outcome }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "checking" || job.nonce !== args.nonce || job.leaseUntil <= Date.now()) return null;
    const resource = await ctx.db.get(job.resourceId);
    const current = eligibleResource(resource, job.companyId) && resource.storageId === job.storageId &&
      !!currentDesignation(resource);
    await ctx.db.patch(job._id, { status: current && job.claimed ? args.status : "unavailable",
      checkedAt: Date.now(), leaseUntil: 0, nonce: undefined });
    return null;
  },
});

export const expireInspection = internalMutation({
  args: { jobId, nonce: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (job?.status === "checking" && job.nonce === args.nonce && job.leaseUntil <= Date.now()) {
      await ctx.db.patch(job._id, { status: "unavailable", nonce: undefined, checkedAt: Date.now(), leaseUntil: 0 });
    }
    return null;
  },
});

export const inspect = internalAction({
  args: { jobId, nonce: v.string() }, returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    let status: Infer<typeof outcome> = "unavailable";
    try {
      const target = new URL(process.env.MICROSITE_PDF_WORKER_URL ?? "");
      const key = process.env.MICROSITE_PDF_WORKER_KEY;
      if (target.protocol !== "https:" || target.pathname !== "/api/microsite-pdf-inspect" || !key || key.length < 32) throw new Error("Worker unavailable");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 55_000);
      try {
        const response = await fetch(target, {
          method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify(args), redirect: "error", signal: controller.signal,
        });
        if (response.ok) {
          const value = await response.json();
          if (value?.policy === PDF_POLICY && value?.inspector === PDF_INSPECTOR &&
            (value.status === "passed" || value.status === "rejected")) status = value.status;
        }
      } finally { clearTimeout(timer); }
    } catch { /* A transport or configuration error leaves the PDF private. */ }
    await ctx.runMutation(internal.micrositeResources.finish, { ...args, status });
    return null;
  },
});

export const setInspectionSuspension = internalMutation({
  args: { suspended: v.boolean() }, returns: v.null(),
  handler: async (ctx, { suspended }) => {
    const usage = await ctx.db.query("micrositePdfUsage").withIndex("by_key", (q) => q.eq("key", "global")).unique();
    if (usage) await ctx.db.patch(usage._id, { suspended });
    else await ctx.db.insert("micrositePdfUsage", { key: "global", day: -1, launches: 0, suspended });
    return null;
  },
});

export const forDelivery = internalMutation({
  args: { slug: v.string(), entryId: v.string(), key: v.string() },
  returns: v.union(v.null(), v.literal("limited"), v.object({ storageId: v.id("_storage"), bytes: v.number() })),
  handler: async (ctx, args) => {
    if (!validMiniSiteSlug(args.slug) || !resourceEntryId.test(args.entryId) || !resourceEntryId.test(args.key)) return null;
    const site = await ctx.db.query("companySites").withIndex("by_slug", (q) => q.eq("slug", args.slug)).first();
    if (!site || !isMiniSitePublished(site) || site.mediaDeliverySuspended ||
      !miniSiteSectionEnabled(site.sections, "resources") || !await ctx.db.get(site.companyId)) return null;
    const entry = site.resources?.find(({ id, enabled, approval }) => enabled && id === args.entryId && approval === args.key);
    const resource = entry && await approvedResource(ctx, site.companyId, entry);
    if (!resource) return null;
    const now = Date.now();
    const bucket = await ctx.db.query("micrositePdfDelivery").withIndex("by_company", (q) => q.eq("companyId", site.companyId)).unique();
    const fresh = !bucket || bucket.windowStart + 3_600_000 <= now;
    const bytes = (fresh ? 0 : bucket.bytes) + resource.sizeBytes;
    if (bytes > PDF_LIMITS.downloadBytesHourly) return "limited";
    if (bucket) await ctx.db.patch(bucket._id, { bytes, windowStart: fresh ? now : bucket.windowStart });
    else await ctx.db.insert("micrositePdfDelivery", { companyId: site.companyId, bytes, windowStart: now });
    return { storageId: resource.storageId, bytes: resource.sizeBytes };
  },
});
