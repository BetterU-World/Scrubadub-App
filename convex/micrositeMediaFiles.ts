"use node";

import sharp from "sharp";
import { v, type Infer } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { MEDIA_LIMITS, mediaMime, type MediaPurpose } from "./lib/micrositeMediaModel";
import { validMediaBytes } from "./lib/micrositeMedia";

const assetId = v.id("micrositeMediaAssets");
const imageInfo = { width: v.number(), height: v.number(), mime: mediaMime, bytes: v.number() };
const formats = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" } as const;
type ImageInfo = { width: number; height: number; mime: Infer<typeof mediaMime>; bytes: number };

function assertStaticContainer(input: Buffer, mime: Infer<typeof mediaMime>) {
  const invalid = () => { throw new Error("Choose a valid, still JPEG, PNG, or WebP photo."); };
  if (mime === "image/jpeg") {
    if (input[0] !== 255 || input[1] !== 216 || input[input.length - 2] !== 255 || input[input.length - 1] !== 217) invalid();
    return;
  }
  const png = mime === "image/png";
  if (png ? !input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) :
    input.length < 12 || input.toString("ascii", 0, 4) !== "RIFF" || input.toString("ascii", 8, 12) !== "WEBP" ||
    input.readUInt32LE(4) + 8 !== input.length) invalid();
  let offset = png ? 8 : 12;
  let ended = !png;
  while (offset + (png ? 12 : 8) <= input.length) {
    const size = png ? input.readUInt32BE(offset) : input.readUInt32LE(offset + 4);
    const type = input.toString("ascii", offset + (png ? 4 : 0), offset + (png ? 8 : 4));
    if (["acTL", "fcTL", "fdAT", "ANIM", "ANMF"].includes(type)) invalid();
    offset += size + (png ? 12 : 8 + (size & 1));
    if (png && type === "IEND") {
      ended = size === 0;
      break;
    }
  }
  if (offset !== input.length || !ended) invalid();
}

export async function normalizeMedia(input: Buffer, purpose: MediaPurpose, mime: Infer<typeof mediaMime>): Promise<Omit<ImageInfo, "bytes"> & { data: Buffer }> {
  if (!validMediaBytes(input.length)) throw new Error("Image exceeds the upload size limit.");
  assertStaticContainer(input, mime);
  const edge = purpose === "portrait" ? MEDIA_LIMITS.portraitEdge : MEDIA_LIMITS.galleryEdge;
  const decoder = sharp(input, { limitInputPixels: edge * edge, failOn: "warning", animated: false });
  const info = await decoder.metadata();
  if (info.format !== formats[mime] || (info.pages ?? 1) !== 1 || !info.width || !info.height ||
    info.width > edge || info.height > edge) throw new Error("Image type or dimensions do not match the prepared photo.");
  const outputMime = mime === "image/jpeg" ? "image/jpeg" : "image/webp";
  const target = purpose === "portrait" ? MEDIA_LIMITS.portraitTargetBytes : MEDIA_LIMITS.galleryTargetBytes;
  const qualities = input.length > target ? [60, 50, 42] : [82, 72, 62];
  let fallback: Omit<ImageInfo, "bytes"> & { data: Buffer } | undefined;
  for (const quality of qualities) {
    // Sharp strips source metadata by default. Rotate first so orientation survives.
    const image = decoder.clone().rotate().toColourspace("srgb");
    const output = await (outputMime === "image/jpeg" ? image.jpeg({ quality }) : image.webp({ quality })).toBuffer({ resolveWithObject: true });
    if (!validMediaBytes(output.data.length)) continue;
    const result = { data: output.data, mime: outputMime, width: output.info.width, height: output.info.height };
    if (output.data.length <= target) return result;
    if (!fallback || output.data.length < fallback.data.length) fallback = result;
  }
  if (fallback) return fallback;
  throw new Error("This photo could not be reduced to the image size limit.");
}

export const upload = action({
  args: { sessionToken: v.string(), assetId, data: v.bytes() },
  returns: v.object({ assetId, ...imageInfo }),
  handler: async (ctx, args): Promise<ImageInfo & { assetId: Id<"micrositeMediaAssets"> }> => {
    if (!validMediaBytes(args.data.byteLength)) throw new Error("Image exceeds the upload size limit.");
    const claim = await ctx.runMutation(internal.micrositeMedia.claim, {
      sessionToken: args.sessionToken, assetId: args.assetId, bytes: args.data.byteLength,
    });
    if (claim.ready) return claim.ready;
    let candidate;
    try {
      const { data, mime, width, height } = await normalizeMedia(Buffer.from(args.data), claim.purpose, claim.mime);
      // A private marker lets an operator verify an orphan after a process crash.
      candidate = await ctx.storage.store(new Blob([new Uint8Array(data)], { type: `${mime}; scrub-site-media=${claim.tag}` }));
      return await ctx.runMutation(internal.micrositeMedia.finish, {
        assetId: args.assetId, lease: claim.lease, storageId: candidate, width, height, mime, bytes: data.length,
      });
    } catch {
      // Never delete a candidate optimistically after an ambiguous commit.
      if (candidate) console.warn("Microsite image registration uncertain", { assetId: args.assetId, candidate });
      await ctx.runMutation(internal.micrositeMedia.release, { assetId: args.assetId, lease: claim.lease });
      throw new Error("We couldn't prepare this photo. Try again or choose a different photo.");
    }
  },
});

export const preview = action({
  args: { sessionToken: v.string(), assetId },
  returns: v.union(v.null(), v.object({ data: v.bytes(), ...imageInfo })),
  handler: async (ctx, args): Promise<(ImageInfo & { data: ArrayBuffer }) | null> => {
    const file = await ctx.runQuery(internal.micrositeMedia.previewFile, args);
    if (!file) return null;
    const { storageId, ...info } = file;
    const blob = await ctx.storage.get(storageId);
    return blob?.size === info.bytes ? { ...info, data: await blob.arrayBuffer() } : null;
  },
});
