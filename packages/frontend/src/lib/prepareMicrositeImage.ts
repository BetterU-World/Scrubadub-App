import { MEDIA_LIMITS, type MediaPurpose } from "../../../../convex/lib/micrositeMediaModel";

const MAX_HEADER = 1024 * 1024;
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif";
export type PreparedImage = { blob: Blob; width: number; height: number; mime: "image/webp" | "image/jpeg" | "image/png" };

export class MediaPreparationError extends Error {
  constructor(public readonly code: "originalTooLarge" | "unsupported" | "heicUnsupported" | "pixels" | "prepareFailed") { super(code); }
}

function dimensions(bytes: Uint8Array): { width: number; height: number; format: "png" | "webp" | "jpeg" | "heic" } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (bytes.length >= 24 && bytes[0] === 137 && ascii(1, 3) === "PNG" && ascii(12, 4) === "IHDR") {
    for (let start = 8; start + 12 <= bytes.length;) {
      const type = ascii(start + 4, 4);
      if (type === "acTL") throw new MediaPreparationError("unsupported");
      if (type === "IDAT") break;
      start += view.getUint32(start) + 12;
    }
    return { width: view.getUint32(16), height: view.getUint32(20), format: "png" };
  }
  if (bytes.length >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const kind = ascii(12, 4);
    if (kind === "VP8X") {
      if (bytes[20] & 2) throw new MediaPreparationError("unsupported");
      const size = (start: number) => 1 + bytes[start] + (bytes[start + 1] << 8) + (bytes[start + 2] << 16);
      return { width: size(24), height: size(27), format: "webp" };
    }
    if (kind === "VP8 " && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) {
      return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff, format: "webp" };
    }
    if (kind === "VP8L" && bytes[20] === 47) {
      const size = view.getUint32(21, true);
      return { width: 1 + (size & 0x3fff), height: 1 + ((size >>> 14) & 0x3fff), format: "webp" };
    }
  }
  if (bytes[0] === 255 && bytes[1] === 216) {
    for (let offset = 2; offset + 9 < bytes.length && bytes[offset] === 255;) {
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 218 || offset + 7 >= bytes.length) break;
      const length = view.getUint16(offset);
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker) && length >= 8) {
        return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3), format: "jpeg" };
      }
      if (length < 2) break;
      offset += length;
    }
  }
  if (bytes.length >= 24 && ascii(4, 4) === "ftyp" &&
    ["heic", "heix", "hevc", "hevx", "mif1"].some((brand) => ascii(8, Math.min(view.getUint32(0), 128) - 8).includes(brand))) {
    // HEIF can include separate properties for thumbnails and grid tiles. Use the
    // largest image spatial property present in the bounded header before decoding.
    let width = 0;
    let height = 0;
    for (let i = 12; i + 16 <= bytes.length; i++) {
      if (bytes[i] !== 105 || ascii(i, 4) !== "ispe" || view.getUint32(i - 4) !== 20) continue;
      const w = view.getUint32(i + 8);
      const h = view.getUint32(i + 12);
      if (w * h > width * height) { width = w; height = h; }
    }
    if (width && height) return { width, height, format: "heic" };
    throw new MediaPreparationError("heicUnsupported");
  }
  throw new MediaPreparationError("unsupported");
}

export async function prepareMicrositeImage(file: File, purpose: MediaPurpose): Promise<PreparedImage> {
  if (file.size > MEDIA_LIMITS.originalBytes) throw new MediaPreparationError("originalTooLarge");
  const header = dimensions(new Uint8Array(await file.slice(0, MAX_HEADER).arrayBuffer()));
  const extension = file.name.toLowerCase().split(".").pop();
  const expected = { jpeg: ["jpg", "jpeg"], png: ["png"], webp: ["webp"], heic: ["heic", "heif"] };
  if (!extension || !expected[header.format].includes(extension)) throw new MediaPreparationError("unsupported");
  if (!header.width || !header.height || header.width * header.height > MEDIA_LIMITS.originalPixels) throw new MediaPreparationError("pixels");
  const edge = purpose === "portrait" ? MEDIA_LIMITS.portraitEdge : MEDIA_LIMITS.galleryEdge;
  const bitmap = typeof createImageBitmap === "function"
    ? await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null) : null;
  const localUrl = bitmap ? undefined : URL.createObjectURL(file);
  const canvas = document.createElement("canvas");
  try {
    const native = localUrl ? new Image() : null;
    if (native && localUrl) {
      native.src = localUrl;
      await native.decode().catch(() => { throw new MediaPreparationError(header.format === "heic" ? "heicUnsupported" : "prepareFailed"); });
    }
    const width = bitmap?.width ?? native?.naturalWidth ?? 0;
    const height = bitmap?.height ?? native?.naturalHeight ?? 0;
    if (!width || !height || width * height > MEDIA_LIMITS.originalPixels) throw new MediaPreparationError("pixels");
    const scale = Math.min(1, edge / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    const source = bitmap ?? native;
    if (!context || !source) throw new MediaPreparationError("prepareFailed");
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const target = purpose === "portrait" ? MEDIA_LIMITS.portraitTargetBytes : MEDIA_LIMITS.galleryTargetBytes;
    let fallback: PreparedImage | undefined;
    for (const quality of [0.85, 0.75, 0.65, 0.55]) {
      let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
      if (blob?.type !== "image/webp" && (header.format === "jpeg" || header.format === "heic")) {
        blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      }
      if (!blob || !["image/webp", "image/jpeg", "image/png"].includes(blob.type)) continue;
      if (blob.size <= MEDIA_LIMITS.imageBytes) {
        fallback = { blob, width: canvas.width, height: canvas.height, mime: blob.type as PreparedImage["mime"] };
        if (blob.size <= target) return fallback;
      }
    }
    if (fallback) return fallback;
    throw new MediaPreparationError("prepareFailed");
  } finally {
    bitmap?.close();
    if (localUrl) URL.revokeObjectURL(localUrl);
    canvas.width = canvas.height = 0;
  }
}
