import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { miniSiteSectionEnabled } from "./miniSiteSections";
import {
  MEDIA_ENTRY_ID, MEDIA_LIMITS, galleryImages, mediaReferences, projectMicrositeMedia,
  type MediaConfig, type PublicMedia,
} from "./micrositeMediaModel";

declare const process: { env: Record<string, string | undefined> };

export const MEDIA_STAGE_TTL = 24 * 60 * 60_000;
export const MEDIA_RETIRE_DELAY = 60 * 60_000;
export const MEDIA_LEASE = 2 * 60_000;

export function validMediaBytes(bytes: number) {
  return Number.isSafeInteger(bytes) && bytes > 0 && bytes <= MEDIA_LIMITS.imageBytes;
}

export async function commitMicrositeMedia(ctx: MutationCtx, companyId: Id<"companies">, ownerId: Id<"users">, previous: MediaConfig | undefined, next: MediaConfig) {
  const refs = mediaReferences(next);
  const galleryCount = next.gallery.reduce((count, entry) => count + galleryImages(entry).filter(Boolean).length, 0);
  const ids = new Set<string>();
  const text = (value: string, limit: number) => Array.from(value).length <= limit;
  if (next.gallery.length > MEDIA_LIMITS.entries || galleryCount > MEDIA_LIMITS.images ||
    next.gallery.filter((entry) => entry.kind === "pair").length > MEDIA_LIMITS.pairs || next.team.length > MEDIA_LIMITS.profiles) {
    throw new Error("Microsite media capacity exceeded.");
  }
  for (const entry of [...next.gallery, ...next.team]) {
    if (!MEDIA_ENTRY_ID.test(entry.id) || ids.has(entry.id)) throw new Error("Invalid media entry identifier.");
    ids.add(entry.id);
    const valid = "kind" in entry
      ? text(entry.title, MEDIA_LIMITS.title) && text(entry.caption, MEDIA_LIMITS.caption)
      : text(entry.name, MEDIA_LIMITS.title) && text(entry.role, MEDIA_LIMITS.title) && text(entry.bio, MEDIA_LIMITS.bio);
    if (!valid) throw new Error("Microsite media text exceeds its limit.");
  }
  const active = new Set<Id<"micrositeMediaAssets">>();
  let savedBytes = 0;
  const now = Date.now();
  for (const ref of refs) {
    if (!text(ref.alt, MEDIA_LIMITS.alt)) throw new Error("Image description exceeds its limit.");
    const asset = await ctx.db.get(ref.assetId);
    if (!asset || asset.companyId !== companyId || asset.purpose !== ref.purpose ||
      (asset.state !== "saved" && (asset.state !== "staged" || asset.ownerId !== ownerId || asset.expiresAt <= now)) ||
      !asset.storageId || !asset.bytes || !await ctx.db.system.get("_storage", asset.storageId)) {
      throw new Error("An image is unavailable. Reupload it or remove it before saving.");
    }
    if (active.has(asset._id)) continue;
    active.add(asset._id);
    savedBytes += asset.bytes;
    if (asset.state === "staged") await ctx.db.patch(asset._id, { state: "saved", expiresAt: 0 });
  }
  if (savedBytes > MEDIA_LIMITS.savedBytes) throw new Error("This site has reached its saved image limit.");
  const removed = new Set(mediaReferences(previous).map(({ assetId }) => assetId));
  for (const assetId of removed) {
    if (active.has(assetId)) continue;
    const asset = await ctx.db.get(assetId);
    if (asset?.companyId === companyId && asset.state === "saved") {
      await ctx.db.patch(assetId, { state: "retired", expiresAt: now + MEDIA_RETIRE_DELAY });
    }
  }
}

function imageOrigin() {
  try {
    const site = new URL(process.env.CONVEX_SITE_URL ?? "");
    if (site.protocol === "https:" || (site.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(site.hostname))) return site.origin;
  } catch {
    // An unconfigured site must not emit unusable media destinations.
  }
}

export async function publicMediaForSite(
  ctx: Pick<QueryCtx, "db">, site: Doc<"companySites">, scope?: { section: "gallery" | "team"; entry: string },
): Promise<PublicMedia> {
  const origin = imageOrigin();
  const visible = {
    gallery: (!scope || scope.section === "gallery") && miniSiteSectionEnabled(site.sections, "gallery"),
    team: (!scope || scope.section === "team") && miniSiteSectionEnabled(site.sections, "team"),
  };
  const gallery = visible.gallery && !site.mediaDeliverySuspended ? site.media?.gallery.filter((item) => item.enabled && (!scope || item.id === scope.entry)) ?? [] : [];
  const team = visible.team ? site.media?.team.filter((item) => item.enabled && (!scope || item.id === scope.entry)) ?? [] : [];
  const config = { gallery, team };
  const assets = new Map<Id<"micrositeMediaAssets">, Doc<"micrositeMediaAssets">>();
  if (!site.mediaDeliverySuspended && origin) {
    await Promise.all([...new Set(mediaReferences(config).map(({ assetId }) => assetId))].map(async (id) => {
      const asset = await ctx.db.get(id);
      if (asset?.companyId === site.companyId && asset.state === "saved" && asset.storageId &&
        asset.width && asset.height && asset.mime && await ctx.db.system.get("_storage", asset.storageId)) assets.set(id, asset);
    }));
  }
  return projectMicrositeMedia(config, visible, (image, section, entry, slot) => {
    const asset = assets.get(image.assetId);
    if (!asset || asset.purpose !== (section === "gallery" ? "gallery" : "portrait")) return undefined;
    return {
      url: `${origin}/microsite-media/${site.slug}/${section}/${entry}/${slot}/${asset.publicKey}`,
      width: asset.width!, height: asset.height!,
    };
  });
}
