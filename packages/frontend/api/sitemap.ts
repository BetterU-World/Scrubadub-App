import type { IncomingMessage, ServerResponse } from "node:http";
import { ConvexHttpClient } from "convex/browser";
import { MINI_SITE_ORIGIN, listPublishedSlugs } from "./_miniSiteRuntime";

const platformPages = ["/", "/cleaning-business-software", "/airbnb-cleaning-software", "/cleaning-company-management-software", "/cleaning-checklist-app", "/janitorial-software", "/maid-service-software", "/commercial-cleaning-software", "/house-cleaning-business-software"];

export function renderSitemap(slugs: string[]) {
  const urls = [...platformPages.map(path => `${MINI_SITE_ORIGIN}${path}`), ...slugs.map(slug => `${MINI_SITE_ORIGIN}/${slug}`)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(url => `<url><loc>${url}</loc></url>`).join("")}</urlset>`;
}

export default async function handler(_req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const convexUrl = process.env.VITE_CONVEX_URL;
  if (!convexUrl) { res.statusCode = 503; res.end("Sitemap unavailable"); return; }
  try {
    const client = new ConvexHttpClient(convexUrl);
    const slugs: string[] = [];
    let cursor: string | undefined;
    let complete = false;
    for (let pageNumber = 0; pageNumber < 25; pageNumber++) {
      const page = await client.query(listPublishedSlugs, { cursor });
      slugs.push(...page.slugs);
      if (page.isDone) { complete = true; break; }
      cursor = page.continueCursor;
    }
    if (!complete) throw new Error("Sitemap capacity exceeded");
    res.statusCode = 200;
    res.end(renderSitemap(slugs));
  } catch {
    res.statusCode = 503;
    res.end("Sitemap unavailable");
  }
}
