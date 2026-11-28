import { httpAction } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex" };
const missing = () => new Response(null, { status: 404, headers });

async function authorized(value: string | null) {
  const key = process.env.MICROSITE_PDF_WORKER_KEY;
  if (!key || key.length < 32 || !value || value.length > 200) return false;
  const encode = new TextEncoder();
  const [a, b] = await Promise.all([value, `Bearer ${key}`].map(async (token) =>
    new Uint8Array(await crypto.subtle.digest("SHA-256", encode.encode(token)))));
  return a.reduce((difference, byte, index) => difference | (byte ^ b[index]), 0) === 0;
}

export const readInspectionFile = httpAction(async (ctx, request) => {
  if (!await authorized(request.headers.get("Authorization"))) return missing();
  const id = request.headers.get("X-Inspection-Job");
  const nonce = request.headers.get("X-Inspection-Nonce");
  if (!id || !/^[a-z0-9]{20,64}$/.test(id) || !nonce || !/^[0-9a-f-]{36}$/.test(nonce)) return missing();
  const file = await ctx.runMutation(internal.micrositeResources.claimTransfer, {
    jobId: id as Id<"micrositePdfInspections">, nonce,
  }).catch(() => null);
  if (!file) return missing();
  const blob = await ctx.storage.get(file.storageId);
  return blob?.size === file.bytes ? new Response(blob, { headers: {
    ...headers, "Content-Type": "application/pdf", "Content-Length": String(file.bytes),
  } }) : missing();
});

export const deliverPublicResource = httpAction(async (ctx, request) => {
  const parts = new URL(request.url).pathname.split("/");
  if (parts.length !== 5) return missing();
  const [, , slug, entryId, key] = parts;
  const file = await ctx.runMutation(internal.micrositeResources.forDelivery, { slug, entryId, key });
  if (file === "limited") return new Response(null, { status: 429, headers: { ...headers, "Retry-After": "3600" } });
  if (!file) return missing();
  const blob = await ctx.storage.get(file.storageId);
  return blob?.size === file.bytes ? new Response(blob, { headers: {
    ...headers, "Content-Type": "application/pdf", "Content-Length": String(file.bytes),
    "Content-Disposition": 'attachment; filename="company-resource.pdf"',
  } }) : missing();
});
