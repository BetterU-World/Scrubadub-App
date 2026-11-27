import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex" };

export const deliverMicrositeImage = httpAction(async (ctx, request) => {
  const parts = new URL(request.url).pathname.split("/");
  const [, , slug, section, entry, slot, key] = parts;
  const missing = () => new Response(null, { status: 404, headers });
  if (parts.length !== 7 || (section !== "gallery" && section !== "team") ||
    (slot !== "image" && slot !== "before" && slot !== "after" && slot !== "portrait")) return missing();
  const file = await ctx.runMutation(internal.micrositeMedia.forDelivery, { slug, section, entry, slot, key });
  if (file === "limited") return new Response(null, { status: 429, headers: { ...headers, "Retry-After": "3600" } });
  if (!file) return missing();
  const blob = await ctx.storage.get(file.storageId);
  if (!blob || blob.size !== file.bytes) return missing();
  return new Response(blob, { headers: {
    ...headers, "Content-Type": file.mime, "Content-Length": String(blob.size), "Content-Disposition": "inline",
  } });
});
