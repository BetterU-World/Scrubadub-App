import { v, type Infer } from "convex/values";

export const MEDIA_LIMITS = {
  entries: 24, images: 32, pairs: 8, profiles: 8,
  originalBytes: 15 * 1024 * 1024, originalPixels: 48_000_000,
  galleryEdge: 1600, portraitEdge: 640, imageBytes: 600_000,
  galleryTargetBytes: 250_000, portraitTargetBytes: 120_000,
  savedBytes: 24_000_000, stages: 8, stagedBytes: 4_800_000,
  uploadsPerHour: 50, deliveryBytesPerHour: 512 * 1024 * 1024,
  title: 100, alt: 160, caption: 320, bio: 500,
} as const;

export const mediaPurpose = v.union(v.literal("gallery"), v.literal("portrait"));
export const mediaMime = v.union(v.literal("image/webp"), v.literal("image/jpeg"), v.literal("image/png"));
export const mediaState = v.union(v.literal("pending"), v.literal("staged"), v.literal("saved"), v.literal("retired"), v.literal("deleted"));
const image = v.object({ assetId: v.id("micrositeMediaAssets"), alt: v.string() });
const galleryFields = { id: v.string(), enabled: v.boolean(), title: v.string(), caption: v.string() };
export const micrositeMediaConfig = v.object({
  gallery: v.array(v.union(
    v.object({ ...galleryFields, kind: v.literal("photo"), image: v.optional(image) }),
    v.object({ ...galleryFields, kind: v.literal("pair"), before: v.optional(image), after: v.optional(image) }),
  )),
  team: v.array(v.object({
    id: v.string(), enabled: v.boolean(), name: v.string(), role: v.string(), bio: v.string(), portrait: v.optional(image),
  })),
});

const publicImage = v.object({ url: v.string(), width: v.number(), height: v.number(), alt: v.string() });
const publicGalleryFields = { id: v.string(), title: v.string(), caption: v.string() };
export const publicMicrositeMedia = v.object({
  gallery: v.array(v.union(
    v.object({ ...publicGalleryFields, kind: v.literal("photo"), image: publicImage }),
    v.object({ ...publicGalleryFields, kind: v.literal("pair"), before: publicImage, after: publicImage }),
  )),
  team: v.array(v.object({ id: v.string(), name: v.string(), role: v.string(), bio: v.string(), portrait: v.optional(publicImage) })),
});

export type MediaConfig = Infer<typeof micrositeMediaConfig>;
export type PublicMedia = Infer<typeof publicMicrositeMedia>;
export type MediaImage = Infer<typeof image>;
export type MediaPurpose = Infer<typeof mediaPurpose>;
export type GalleryEntry = MediaConfig["gallery"][number];
export type TeamEntry = MediaConfig["team"][number];
export const EMPTY_MEDIA: MediaConfig = { gallery: [], team: [] };
export const MEDIA_ENTRY_ID = /^[a-zA-Z0-9_-]{1,64}$/;

export function galleryImages(entry: GalleryEntry) {
  return entry.kind === "photo" ? [entry.image] : [entry.before, entry.after];
}

export function mediaReferences(config: MediaConfig | undefined) {
  return [
    ...(config?.gallery ?? []).flatMap((entry) => galleryImages(entry).flatMap((image) => image ? [{ ...image, purpose: "gallery" as const }] : [])),
    ...(config?.team ?? []).flatMap(({ portrait }) => portrait ? [{ ...portrait, purpose: "portrait" as const }] : []),
  ];
}

export function projectMicrositeMedia(
  config: MediaConfig | undefined,
  visible: { gallery: boolean; team: boolean },
  resolve: (image: MediaImage, section: "gallery" | "team", entry: string, slot: "image" | "before" | "after" | "portrait") =>
    Omit<Infer<typeof publicImage>, "alt"> | undefined,
): PublicMedia {
  const render = (image: MediaImage | undefined, section: "gallery" | "team", entry: string, slot: "image" | "before" | "after" | "portrait") => {
    if (!image || !image.alt.trim()) return undefined;
    const source = resolve(image, section, entry, slot);
    return source ? { ...source, alt: image.alt } : undefined;
  };
  return {
    gallery: visible.gallery ? (config?.gallery ?? []).flatMap((entry): PublicMedia["gallery"] => {
      if (!entry.enabled) return [];
      const fields = { id: entry.id, title: entry.title, caption: entry.caption };
      if (entry.kind === "photo") {
        const image = render(entry.image, "gallery", entry.id, "image");
        return image ? [{ ...fields, kind: "photo", image }] : [];
      }
      const before = render(entry.before, "gallery", entry.id, "before");
      const after = render(entry.after, "gallery", entry.id, "after");
      return before && after ? [{ ...fields, kind: "pair", before, after }] : [];
    }) : [],
    team: visible.team ? (config?.team ?? []).flatMap((entry) => {
      if (!entry.enabled || !entry.name.trim() || !entry.role.trim()) return [];
      const portrait = entry.portrait && render({ ...entry.portrait, alt: entry.portrait.alt.trim() || entry.name }, "team", entry.id, "portrait");
      return [{ id: entry.id, name: entry.name, role: entry.role, bio: entry.bio, ...(portrait ? { portrait } : {}) }];
    }) : [],
  };
}
