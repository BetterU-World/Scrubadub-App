import { RESOURCE_MAX_BYTES } from "../../../../../convex/lib/companyResources";

const CHUNK_BYTES = 8 * 1024 * 1024;

export async function fetchResourceBlob(args: {
  site: string; route: "staff" | "client"; resourceId: string; sessionToken: string;
  onProgress?: (fraction: number) => void; signal?: AbortSignal;
}): Promise<Blob> {
  const url = new URL(`${args.site}/${args.route === "staff" ? "resources" : "client/resources"}/file`);
  url.searchParams.set("resourceId", args.resourceId);
  const get = async (start: number, end: number, generation?: string) => {
    if (generation) url.searchParams.set("generation", generation);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${args.sessionToken}`, Range: `bytes=${start}-${end}` }, signal: args.signal });
    if (!response.ok || response.status !== 206) throw new Error(response.status === 409 ? "Resource file changed" : "Resource unavailable");
    const range = response.headers.get("Content-Range");
    const match = range && /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range);
    const nextGeneration = response.headers.get("X-Resource-Generation");
    if (!match || Number(match[1]) !== start || Number(match[2]) !== end || !nextGeneration || generation && nextGeneration !== generation) throw new Error("Resource file changed");
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== end - start + 1) throw new Error("Resource transfer incomplete");
    return { bytes, total: Number(match[3]), generation: nextGeneration, mimeType: response.headers.get("Content-Type") ?? "application/octet-stream" };
  };
  const first = await get(0, 0);
  if (!Number.isSafeInteger(first.total) || first.total < 1 || first.total > RESOURCE_MAX_BYTES) throw new Error("Invalid Resource size");
  const parts: Array<ArrayBuffer> = [first.bytes];
  let received = 1;
  args.onProgress?.(received / first.total);
  while (received < first.total) {
    const end = Math.min(first.total - 1, received + CHUNK_BYTES - 1);
    const chunk = await get(received, end, first.generation);
    if (chunk.total !== first.total || chunk.mimeType !== first.mimeType) throw new Error("Resource file changed");
    parts.push(chunk.bytes);
    received = end + 1;
    args.onProgress?.(received / first.total);
  }
  return new Blob(parts, { type: first.mimeType });
}

export function uploadResourceCandidate(uploadUrl: string, file: File, mimeType: string, nonce: string, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("Upload cancelled", "AbortError")); return; }
    const request = new XMLHttpRequest();
    const cancel = () => request.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    request.open("POST", uploadUrl);
    request.setRequestHeader("Content-Type", `${mimeType}; scrub-intent=${nonce}`);
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(event.loaded / event.total); };
    request.onload = () => {
      signal?.removeEventListener("abort", cancel);
      if (request.status < 200 || request.status >= 300) { reject(new Error("Resource upload failed")); return; }
      try {
        const storageId = JSON.parse(request.responseText).storageId;
        if (typeof storageId !== "string") throw new Error("Resource upload response is invalid");
        resolve(storageId);
      } catch (error) { reject(error); }
    };
    request.onerror = () => { signal?.removeEventListener("abort", cancel); reject(new Error("Resource upload failed")); };
    request.onabort = () => { signal?.removeEventListener("abort", cancel); reject(new DOMException("Upload cancelled", "AbortError")); };
    request.send(file);
  });
}
