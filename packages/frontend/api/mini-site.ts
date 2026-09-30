import type { IncomingMessage, ServerResponse } from "node:http";
import { ConvexHttpClient } from "convex/browser";
import { RESERVED_SLUGS, getBySlug, validMiniSiteSlug } from "./_miniSiteRuntime";
import { renderMiniSiteHtml } from "./_miniSiteHtml";

async function appShell() {
  const deploymentHost = process.env.VERCEL_URL || "scrubscrubscrub.com";
  const response = await fetch(`https://${deploymentHost}/index.html`);
  if (!response.ok) throw new Error("Unable to load app shell");
  return response.text();
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const requestUrl = new URL(req.url || "/", "https://scrubscrubscrub.com");
  const slug = requestUrl.searchParams.get("slug") || "";
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (RESERVED_SLUGS.has(slug)) {
    try { res.statusCode = 200; res.end(await appShell()); }
    catch { res.statusCode = 503; res.end("Page temporarily unavailable"); }
    return;
  }
  if (!validMiniSiteSlug(slug)) {
    res.statusCode = 404;
    res.setHeader("X-Robots-Tag", "noindex");
    res.end("<!doctype html><html><head><title>Page not found</title></head><body><h1>Page not found</h1></body></html>");
    return;
  }
  const convexUrl = process.env.VITE_CONVEX_URL;
  if (!convexUrl) {
    res.statusCode = 503;
    res.setHeader("X-Robots-Tag", "noindex");
    res.end("Page temporarily unavailable");
    return;
  }
  try {
    const client = new ConvexHttpClient(convexUrl);
    const site = await client.query(getBySlug, { slug });
    if (!site) {
      res.statusCode = 404;
      res.setHeader("X-Robots-Tag", "noindex");
      res.end("<!doctype html><html><head><title>Page not found</title></head><body><h1>Page not found</h1></body></html>");
      return;
    }
    if (requestUrl.searchParams.get("subpage") === "cleaner") {
      res.statusCode = 200;
      res.setHeader("X-Robots-Tag", "noindex");
      res.end(await appShell());
      return;
    }
    res.statusCode = 200;
    if (site.searchIndexEligible === false || (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production")) res.setHeader("X-Robots-Tag", "noindex");
    res.end(renderMiniSiteHtml(await appShell(), site));
  } catch {
    res.statusCode = 503;
    res.setHeader("X-Robots-Tag", "noindex");
    res.end("Page temporarily unavailable");
  }
}
