import { v } from "convex/values";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { requireOwnerSession } from "./lib/sessionAuth";
import { checkRateLimit } from "./lib/rateLimit";
import { isMiniSitePublished, validMiniSiteSlug } from "./lib/miniSiteSeo";
import { MEDIA_ENTRY_ID, MEDIA_LIMITS, mediaMime, mediaPurpose, mediaReferences } from "./lib/micrositeMediaModel";
import { MEDIA_LEASE, MEDIA_STAGE_TTL, publicMediaForSite, validMediaBytes } from "./lib/micrositeMedia";

const assetId = v.id("micrositeMediaAssets");
const storageId = v.id("_storage");
const ready = v.object({ assetId, width: v.number(), height: v.number(), mime: mediaMime, bytes: v.number() });
const read = v.object({ storageId, width: v.number(), height: v.number(), mime: mediaMime, bytes: v.number() });
const section = v.union(v.literal("gallery"), v.literal("team"));
const slot = v.union(v.literal("image"), v.literal("before"), v.literal("after"), v.literal("portrait"));

function file(asset: Doc<"micrositeMediaAssets"> | null) {
  if (!asset?.storageId || !asset.mime || !asset.width || !asset.height || !asset.bytes) return null;
  return { storageId: asset.storageId, mime: asset.mime, width: asset.width, height: asset.height, bytes: asset.bytes };
}

function readyImage(asset: Doc<"micrositeMediaAssets">) {
  const details = file(asset);
  if (!details) throw new Error("Image unavailable.");
  const { width, height, mime, bytes } = details;
  return { assetId: asset._id, width, height, mime, bytes };
}

function matchesStorageTag(stored: { _creationTime: number; contentType?: string } | null, asset: Doc<"micrositeMediaAssets">) {
  return stored && stored._creationTime >= asset._creationTime &&
    ["image/webp", "image/jpeg", "image/png"].some((mime) => stored.contentType === `${mime}; scrub-site-media=${asset.storageTag}`);
}

async function siteForCompany(ctx: Pick<QueryCtx, "db">, companyId: Doc<"micrositeMediaAssets">["companyId"]) {
  return ctx.db.query("companySites").withIndex("by_companyId", (q) => q.eq("companyId", companyId)).first();
}

export const begin = mutation({
  args: { sessionToken: v.string(), requestId: v.string(), purpose: mediaPurpose, bytes: v.number(), mime: mediaMime },
  returns: v.object({ assetId, ready: v.union(v.null(), ready) }),
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken);
    if (!MEDIA_ENTRY_ID.test(args.requestId) || !validMediaBytes(args.bytes)) throw new Error("Invalid image size or upload request.");
    const prior = await ctx.db.query("micrositeMediaAssets")
      .withIndex("by_company_request", (q) => q.eq("companyId", owner.companyId).eq("requestId", args.requestId)).unique();
    const now = Date.now();
    if (prior) {
      if (prior.ownerId !== owner._id || prior.purpose !== args.purpose || prior.inputMime !== args.mime ||
        prior.reservedBytes !== args.bytes || (prior.state !== "saved" && (prior.expiresAt <= now || !["pending", "staged"].includes(prior.state)))) {
        throw new Error("Image upload expired or changed. Select the image again.");
      }
      return { assetId: prior._id, ready: prior.state === "pending" ? null : readyImage(prior) };
    }
    const active = await Promise.all((["pending", "staged"] as const).map((state) =>
      ctx.db.query("micrositeMediaAssets").withIndex("by_company_state_expiry", (q) =>
        q.eq("companyId", owner.companyId).eq("state", state).gt("expiresAt", now)).take(MEDIA_LIMITS.stages)));
    const stages = active.flat();
    if (stages.length >= MEDIA_LIMITS.stages || stages.reduce<number>((sum, asset) => sum + (asset.bytes ?? MEDIA_LIMITS.imageBytes), MEDIA_LIMITS.imageBytes) > MEDIA_LIMITS.stagedBytes) {
      throw new Error("Save or remove pending images before uploading more.");
    }
    await checkRateLimit(ctx, { key: `microsite-media-hour:${owner.companyId}`, limit: MEDIA_LIMITS.uploadsPerHour, windowMs: 3_600_000 });
    await checkRateLimit(ctx, { key: `microsite-media-burst:${owner.companyId}`, limit: MEDIA_LIMITS.stages, windowMs: 10_000 });
    const id = await ctx.db.insert("micrositeMediaAssets", {
      companyId: owner.companyId, ownerId: owner._id, purpose: args.purpose, state: "pending", requestId: args.requestId,
      publicKey: crypto.randomUUID(), storageTag: crypto.randomUUID(), inputMime: args.mime, reservedBytes: args.bytes, expiresAt: now + MEDIA_STAGE_TTL,
    });
    return { assetId: id, ready: null };
  },
});

export const claim = internalMutation({
  args: { sessionToken: v.string(), assetId, bytes: v.number() },
  returns: v.union(v.object({ ready }), v.object({ lease: v.string(), tag: v.string(), purpose: mediaPurpose, mime: mediaMime })),
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken);
    const asset = await ctx.db.get(args.assetId);
    const now = Date.now();
    if (!asset || asset.companyId !== owner.companyId || asset.ownerId !== owner._id || asset.reservedBytes !== args.bytes) throw new Error("Upload unavailable.");
    if (asset.state === "saved" || asset.state === "staged" && asset.expiresAt > now) return { ready: readyImage(asset) };
    if (asset.state !== "pending" || asset.expiresAt <= now || (asset.leaseUntil ?? 0) > now) throw new Error("Upload expired or in progress.");
    const attempts = asset.uploadClaims ?? 0;
    if (attempts >= MEDIA_LIMITS.uploadClaims) throw new Error("Image retry limit reached. Select the photo again.");
    const lease = crypto.randomUUID();
    await ctx.db.patch(asset._id, { lease, leaseUntil: now + MEDIA_LEASE, uploadClaims: attempts + 1 });
    return { lease, tag: asset.storageTag, purpose: asset.purpose, mime: asset.inputMime };
  },
});

export const finish = internalMutation({
  args: { assetId, lease: v.string(), storageId, width: v.number(), height: v.number(), mime: mediaMime, bytes: v.number() },
  returns: ready,
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    const stored = await ctx.db.system.get("_storage", args.storageId);
    if (asset?.state !== "pending" || asset.lease !== args.lease || asset.expiresAt <= Date.now() ||
      !stored || stored.contentType !== `${args.mime}; scrub-site-media=${asset.storageTag}` ||
      stored.size !== args.bytes || !validMediaBytes(args.bytes)) throw new Error("Image upload could not be registered.");
    const { storageId, width, height, mime, bytes } = args;
    await ctx.db.patch(asset._id, { state: "staged", storageId, width, height, mime, bytes, lease: undefined, leaseUntil: undefined });
    return { assetId: asset._id, width, height, mime, bytes };
  },
});

export const release = internalMutation({
  args: { assetId, lease: v.string(), candidate: v.optional(storageId) }, returns: v.null(),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset) return null;
    if (args.candidate) {
      const stored = await ctx.db.system.get("_storage", args.candidate);
      if (matchesStorageTag(stored, asset) &&
        !await ctx.db.query("micrositeMediaAssets").withIndex("by_storage", (q) => q.eq("storageId", args.candidate)).first()) {
        await ctx.storage.delete(args.candidate);
      }
    }
    if ((asset.state === "pending" || asset.state === "retired") && asset.lease === args.lease) {
      await ctx.db.patch(asset._id, { lease: undefined, leaseUntil: undefined });
    }
    return null;
  },
});

export const discard = mutation({
  args: { sessionToken: v.string(), assetId }, returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken);
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.companyId !== owner.companyId || asset.ownerId !== owner._id || !["pending", "staged"].includes(asset.state)) return null;
    const site = await siteForCompany(ctx, owner.companyId);
    if (!mediaReferences(site?.media).some((ref) => ref.assetId === asset._id)) {
      await ctx.db.patch(asset._id, { state: "retired", expiresAt: Math.max(Date.now(), asset.leaseUntil ?? 0) });
    }
    return null;
  },
});

export const previewFile = internalQuery({
  args: { sessionToken: v.string(), assetId }, returns: v.union(v.null(), read),
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken);
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.companyId !== owner.companyId) return null;
    if (asset.state === "staged") return asset.ownerId === owner._id && asset.expiresAt > Date.now() ? file(asset) : null;
    if (asset.state !== "saved") return null;
    const site = await siteForCompany(ctx, owner.companyId);
    return mediaReferences(site?.media).some((ref) => ref.assetId === asset._id) ? file(asset) : null;
  },
});

export const forDelivery = internalMutation({
  args: { slug: v.string(), section, entry: v.string(), slot, key: v.string() },
  returns: v.union(v.null(), v.literal("limited"), read),
  handler: async (ctx, args) => {
    if (!validMiniSiteSlug(args.slug) || !MEDIA_ENTRY_ID.test(args.entry) || !MEDIA_ENTRY_ID.test(args.key)) return null;
    const site = await ctx.db.query("companySites").withIndex("by_slug", (q) => q.eq("slug", args.slug)).first();
    if (!site || !isMiniSitePublished(site) || site.mediaDeliverySuspended || !await ctx.db.get(site.companyId)) return null;
    const view = await publicMediaForSite(ctx, site, args);
    const projected = (args.section === "gallery" ? view.gallery : view.team).find(({ id }) => id === args.entry);
    const image = projected && args.slot in projected ? projected[args.slot as keyof typeof projected] as unknown : null;
    if (!image || typeof image !== "object" || !("url" in image) || typeof image.url !== "string" || !image.url.endsWith(`/${args.slot}/${args.key}`)) return null;
    const entry = (args.section === "gallery" ? site.media?.gallery : site.media?.team)?.find(({ id }) => id === args.entry);
    const ref = entry && args.slot in entry ? entry[args.slot as keyof typeof entry] as unknown : null;
    if (!ref || typeof ref !== "object" || !("assetId" in ref)) return null;
    const asset = await ctx.db.get(ref.assetId as Doc<"micrositeMediaAssets">["_id"]);
    const result = file(asset);
    if (!result || asset?.publicKey !== args.key) return null;
    const now = Date.now();
    const bucket = await ctx.db.query("micrositeMediaDelivery").withIndex("by_company", (q) => q.eq("companyId", site.companyId)).unique();
    const fresh = !bucket || bucket.windowStart + 3_600_000 <= now;
    const bytes = (fresh ? 0 : bucket.bytes) + result.bytes;
    if (bytes > MEDIA_LIMITS.deliveryBytesPerHour) return "limited";
    if (bucket) await ctx.db.patch(bucket._id, { windowStart: fresh ? now : bucket.windowStart, bytes });
    else await ctx.db.insert("micrositeMediaDelivery", { companyId: site.companyId, windowStart: now, bytes });
    return result;
  },
});

export const setDeliverySuspension = internalMutation({
  args: { companyId: v.id("companies"), suspended: v.boolean() }, returns: v.null(),
  handler: async (ctx, args) => {
    const site = await siteForCompany(ctx, args.companyId);
    if (!site) throw new Error("Company site unavailable.");
    await ctx.db.patch(site._id, { mediaDeliverySuspended: args.suspended });
    return null;
  },
});

export const cleanup = internalMutation({
  args: {}, returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now();
    const batches = await Promise.all((["pending", "staged", "retired"] as const).map((state) =>
      ctx.db.query("micrositeMediaAssets").withIndex("by_state_expiry", (q) => q.eq("state", state).lt("expiresAt", now)).take(16)));
    let removed = 0;
    for (const asset of batches.flat()) {
      if ((asset.leaseUntil ?? 0) > now) continue;
      const site = await siteForCompany(ctx, asset.companyId);
      if (mediaReferences(site?.media).some((ref) => ref.assetId === asset._id)) continue;
      if (asset.storageId) await ctx.storage.delete(asset.storageId);
      await ctx.db.patch(asset._id, { state: "deleted", storageId: undefined, lease: undefined, leaseUntil: undefined });
      removed++;
    }
    return removed;
  },
});

// Operator CLI only. Match a candidate found in storage inventory against its private tag.
export const reconcileOrphan = internalMutation({
  args: { assetId, storageId }, returns: v.boolean(),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    const stored = await ctx.db.system.get("_storage", args.storageId);
    if (!stored) return false;
    if (!asset || (asset.leaseUntil ?? 0) > Date.now() ||
      (asset.state === "pending" && asset.expiresAt > Date.now()) ||
      !matchesStorageTag(stored, asset) ||
      await ctx.db.query("micrositeMediaAssets").withIndex("by_storage", (q) => q.eq("storageId", args.storageId)).first()) {
      throw new Error("Storage object is not a verified orphan of this image upload.");
    }
    await ctx.storage.delete(args.storageId);
    return true;
  },
});
