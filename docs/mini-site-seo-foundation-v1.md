# Mini-site SEO Foundation V1

## Publication and legacy records

New auto-provisioned `companySites` start with `isPublished: false`. Owners publish from `/site` after entering a name, description, and primary service area. Draft and missing slugs return HTTP 404 and `X-Robots-Tag: noindex` from the request-time handler.

Existing records without `isPublished` remain public if they contain any owner-entered mini-site content or public contact/imagery. An untouched auto-provisioned record (empty bio, area, services, contact, and imagery) is treated as a draft. The setup form shows that effective legacy state. Older clients that omit the new fields preserve publication and additional-area values on save. No destructive data migration is required.

## Request-time HTML

Vercel routes a single-segment mini-site URL to `packages/frontend/api/mini-site.ts`. The function queries only `companySites.getBySlug`, fetches the deployment's built `/index.html`, and adds company-specific metadata and a semantic content snapshot inside `#root`. React then mounts the interactive page using the same public query and shared title/description/area rules. Missing, draft, and invalid slugs return 404. The cleaner subpage receives the app shell with `noindex`.

`VITE_CONVEX_URL` must be available to the Vercel function at runtime. `VERCEL_URL` supplies the deployment host for its built app shell. Canonical URLs intentionally use the production domain. Preview deployments and identifiable QA fixtures receive `noindex`. The function uses `no-store` so unpublishing and edits are reflected immediately.

The sitemap function scans company sites in bounded Convex pages, includes published valid non-QA sites, and omits capability, auth, demo, and recruitment routes. It fails rather than emitting a silently incomplete sitemap after 25 pages (5,000 site records); sitemap partitioning can be added if that capacity is approached.

## Release validation

After deployment, inspect raw HTTP responses (for example with `curl -i`): a published mini-site must return 200 with its company name, title, meta description, self canonical, OG/Twitter tags, and JSON-LD in the response body. A draft slug and missing slug must return 404 and `noindex`. A published `/{slug}/cleaner` must return 200 with `noindex`. Verify `/giveaway`, `/showcase`, `/r/:token`, `/c/:token`, assets, and `/sitemap.xml` still route correctly. This check is required before promotion; local function tests do not exercise Vercel's routing layer.
