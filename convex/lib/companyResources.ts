export const RESOURCE_MAX_BYTES = 10 * 1024 * 1024;
export const RESOURCE_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export type ResourceMimeType = typeof RESOURCE_MIME_TYPES[number];

const extensions: Record<ResourceMimeType, string[]> = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
};

export function cleanResourceTitle(value: string): string {
  const title = value.trim();
  if (!title || Array.from(title).length > 200) throw new Error("Resource title must be 1–200 characters");
  return title;
}

export function cleanResourceDescription(value: string | undefined): string | undefined {
  const description = value?.trim();
  if (!description) return undefined;
  if (Array.from(description).length > 1000) throw new Error("Resource description must be at most 1,000 characters");
  return description;
}

export function cleanResourceFilename(value: string): string {
  const basename = value.split(/[/\\]/).pop() ?? "";
  const safe = basename.normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069<>:"|?*]/g, "")
    .trim();
  if (!safe || safe === "." || safe === "..") throw new Error("Invalid filename");
  const dot = safe.lastIndexOf(".");
  const extension = dot > 0 ? safe.slice(dot) : "";
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  return [...Array.from(stem).slice(0, Math.max(1, 180 - Array.from(extension).length)), ...Array.from(extension)].join("");
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

export function detectResourceMime(bytes: Uint8Array): ResourceMimeType | null {
  if (bytes.length >= 10 && ascii(bytes, 0, 5) === "%PDF-" && ascii(bytes, Math.max(0, bytes.length - 2048), Math.min(bytes.length, 2048)).includes("%%EOF")) return "application/pdf";
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9) return "image/jpeg";
  if (bytes.length >= 45 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte) && ascii(bytes, 12, 4) === "IHDR" && ascii(bytes, bytes.length - 8, 4) === "IEND") {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(16) > 0 && view.getUint32(20) > 0) return "image/png";
  }
  if (bytes.length >= 21 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const kind = ascii(bytes, 12, 4);
    if (view.getUint32(4, true) + 8 === bytes.length && ["VP8 ", "VP8L", "VP8X"].includes(kind) && view.getUint32(16, true) > 0 && view.getUint32(16, true) + 20 <= bytes.length) return "image/webp";
  }
  return null;
}

export function validateResourceFile(bytes: Uint8Array, declaredMime: string, originalName: string) {
  if (bytes.length === 0) throw new Error("File is empty");
  if (bytes.length > RESOURCE_MAX_BYTES) throw new Error("File exceeds 10 MB limit");
  const filename = cleanResourceFilename(originalName);
  const mimeType = detectResourceMime(bytes);
  if (!mimeType) throw new Error("Unsupported or invalid file content");
  if (declaredMime && declaredMime.toLowerCase() !== mimeType) throw new Error("File type does not match its content");
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!extensions[mimeType].includes(extension)) throw new Error("Filename extension does not match file type");
  return { originalFileName: filename, mimeType, sizeBytes: bytes.length };
}

export function cleanUploadRequestId(value: string): string {
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(value)) throw new Error("Invalid upload request ID");
  return value;
}

export function resourceUploadKey(userId: string, requestId: string, resourceId?: string) {
  return `${userId}:${resourceId ? `replace:${resourceId}` : "create"}:${cleanUploadRequestId(requestId)}`;
}
