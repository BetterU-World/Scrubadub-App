# Undici remediation PR 1

Baseline: `3feb03ead6bede3569287797bf33d7bed0fba43b`. Evidence collected October 20, 2026.

## Scope and compatibility

Only three fields in `package-lock.json` change: Undici version **6.23.0 → 6.28.1**, tarball URL and integrity. Registry metadata confirms the new integrity and Node >=18.17 requirement. Exact chain: root `@vercel/blob@2.3.0 → undici@^6.23.0`; the unchanged range accepts 6.28.1. A structural comparison verifies no other locked package entry changes. Application code, schemas, package manifests/ranges, secondary frontend lockfile and Vercel settings remain unchanged; only tests and this evidence document accompany the lock change.

The Convex Node action `actions/manuals:getManualSignedUrl` uses Blob's Undici fetch after checking verified staff sessions and manual visibility. It consumes the response into a Blob before storing it in Convex; buffering and existing storage URL semantics are unchanged. The High Undici WebSocket APIs are not called by this path. This is preventive runtime remediation, not a demonstrated public High exploit. Node's built-in HTTP implementation and hosted platform runtimes are outside this package change.

## Before and after audit

Both snapshots were captured during this task with `npm audit --package-lock-only --json`, with and without `--omit=dev`. Audit exits nonzero because unrelated findings remain.

| Graph | Critical | High | Moderate | Low | Total |
|---|---:|---:|---:|---:|---:|
| Full before | 1 | 14 | 8 | 1 | 24 |
| Full after | 1 | 13 | 8 | 1 | 23 |
| Omit-dev before | 0 | 10 | 5 | 0 | 15 |
| Omit-dev after | 0 | 9 | 5 | 0 | 14 |

The Undici entry and its 14 advisory records disappear; all other findings remain unchanged. Version 6.28.1 clears every returned affected range, including the [WebSocket subprotocol advisory](https://github.com/advisories/GHSA-rfgv-xxqx-mfg5).

After full root clean install, `npm ls undici --all` shows exactly one installed copy: `@vercel/blob@2.3.0 → undici@6.28.1`. The frontend-only clean install intentionally omits both backend-only packages.

## Vercel configuration and installation graph

Project **scrubadub-app-frontend**, team **scrubadubs-projects**. [Production Build and Deployment settings](https://vercel.com/scrubadubs-projects/scrubadub-app-frontend/settings/build-and-deployment) were observed read-only in the authenticated browser and independently confirmed by the user:

- Vite preset; Root Directory `packages/frontend`.
- Install and Build Command overrides OFF; default Output Directory `dist`.
- Include files outside Root Directory in Build Step enabled; Skip Deployments disabled.
- Dashboard shows Node 24.x.

User-supplied log observations for production commit `3feb03e`: npm, restored build cache, installation “up to date in 1s”, `npm run build → vite build`, two skipped esbuild postinstall scripts, an unknown `cache-dir` warning, successful build in about 45 seconds. These observations do **not** identify the selected lockfile or installed versions. This is user-provided log evidence, not a raw downloaded build log.

The Vercel connector listed the project but returned HTTP 403 for project details and production deployment logs under this team. No Vercel CLI/independent token was present. Browser observation retrieved settings, but log navigation failed; no settings or permissions were changed.

| Context | Evidence and conclusion |
|---|---|
| GitHub Actions | `.github/workflows/ci.yml`: Ubuntu, Node 20, root `npm ci`, backend/frontend TypeScript, Vitest, workspace frontend build. Validates root lock and backend graph. |
| Local root clean install | Node 24.13.1/npm 11.8.0; 373 packages; Blob 2.3.0/Undici 6.28.1; Convex 1.31.7; no installed ws; root lock hash unchanged. |
| Local clean `npm ci` from `packages/frontend`, intact repository | npm recognizes workspace root; 297 packages; Convex 1.31.7; no ws, Blob or Undici; both lock hashes unchanged; frontend build passes. Uses root lock's selected workspace graph. |
| Secondary frontend lock standalone | Convex 1.32.0 → exact ws 8.18.0. No frontend Blob/Undici dependency. Different graph from root CI. |

Local workspace behavior supports the expected root-lock selection but **does not attest a cached Vercel deployment**. Hosted npm version, install-time root availability/configuration and actual installed versions remain unverified. Do not claim root CI proves the deployed graph. Undici remediation affects the separately deployed Convex backend; a frontend-only Vercel build cannot replace that backend bundle.

Safe follow-up: a clean build of this commit in an isolated nonproduction Vercel project/preview with cache disabled and production settings preserved. Record `pwd`, Node/npm versions, `npm prefix`, install command/log, installed versions and `npm ls convex ws undici @vercel/blob --all`, plus both lock hashes. Do not print environment values. Any diagnostic install override belongs only to that isolated project. No hosted build/configuration change was performed here.

## Secondary-lock ws relevance

The unchanged frontend lock resolves Convex 1.32.0 → ws 8.18.0; root Convex 1.31.7 has no ws dependency. [Memory exhaustion](https://github.com/advisories/GHSA-96hv-2xvq-fx4p) affects ws 8.x <8.21.0; [uninitialized disclosure](https://github.com/advisories/GHSA-58qx-3vcg-4xpx) affects 8.x <8.20.1. Version 8.21.0 clears both reported advisories.

Published Convex 1.32.0 was downloaded solely for temporary source inspection. Its `./browser` Node export points to `dist/esm/browser/index-node.js`, reexporting ConvexClient from `simple_client-node.js` and ConvexHttpClient from `http_client.js`. **simple_client-node.js bundles ws 8.18.0 source**, then registers its WebSocket constructor; importing it does not itself open a socket. The HTTP client uses fetch. SCRUB Vercel handlers `api/mini-site.ts` and `api/sitemap.ts` instantiate ConvexHttpClient, not ConvexClient/WebSocketServer. React uses browser WebSockets. No public ws listener or route to affected send/receive paths was found. Node subscription/CLI connections to a malicious WebSocket peer remain the conditional exposure if this graph is installed.

A ws override can change the separate package while leaving embedded ws vulnerable. Subsequent fix: prove and standardize the install graph, then consider retiring the obsolete nested lock in its own PR. If Convex 1.32.0's graph must remain, select an upstream release whose **bundle** is verified rebuilt with patched ws and regression-test it. Do not infer an unpublished version from an audit range or treat a zero audit count as proof embedded code is patched. No Convex/ws change is included here.

## Validation and limits

Local Windows Node 24.13.1/npm 11.8.0 checks:

- New focused manual tests: **23 passed**, using real Blob SDK + installed Undici, synthetic Bearer token, MockAgent with network disabled, and loopback-only real HTTP chunked PDF content. Actual Convex action/query run through convex-test; exact stored bytes/content type are checked.
- Covers owner/cleaner/maintenance/manager allowed downloads, worker denial for owner-only content, missing/expired/idle-expired/revoked/mismatched/inactive sessions, deleted manual, Blob 403/404/500, token requirement, kill switch, URL normalization and transport failure. Denied/error paths do not store content.
- Backend/frontend `npm run typecheck`: passed.
- Frontend production build: passed from root script and clean frontend-directory install. Existing Browserslist age/large-chunk warnings retained.
- Complete suite: **175 files, 1,169 tests passed**. TypeScript's existing missing `typescript.js.map` warning did not fail tests.
- Root clean npm ci repeated with lifecycle scripts enabled: lock hash unchanged. Focused download plus existing manual-administration authorization suite after reinstall: **2 files, 28 tests passed**.
- Existing action locally bundled with esbuild: passed. No application implementation was changed.

GitHub's Ubuntu/Node 20 run is distinct from local Node 24 validation. Inspect the draft PR checks before merge; local success does not claim remote CI completion.

Nonproduction checks were isolated in-memory Convex functions/storage and real loopback HTTP. No cloud Convex push or actual provider-store round trip occurred: there is no dedicated nonproduction Blob token/configuration in this worktree, and the existing QA deployment was not repurposed/reseeded. Cloud Node-runtime/storage/provider compatibility remains a pre-release smoke check in an explicitly isolated nonproduction environment. Root `npm run build` was not run because it executes `convex deploy`.

## Deployment impact and rollback

No merge, production deployment, production asset read/write, schema migration or storage-policy change occurred. The draft branch may trigger configured preview/CI automation. A future authorized release must clean-install the root lock and deploy the Convex Node action bundle from it; frontend deployment alone is insufficient.

Rollback: revert this PR's lock change (or select the previous known-good release), clean-install that lock and redeploy the previous Convex backend through the normal authorized release process. Git reversion alone does not replace deployed bundles. No data rollback is required. This restores the old advisories and should be temporary. No rollback was executed.

## Residual inventory

Generated below from the post-change full audit. “Prod audit” means npm install classification, not proven runtime exposure. CSS tools appear there via production-listed typography/Tailwind peers. Braces has no published patch; Tailwind 4 migration and parser overrides remain separate reviewed work. No residual is suppressed or silently accepted.

| Package | Locked version | Severity | Prod audit | Exposure / advisory source |
|---|---|---|---|---|
| @babel/core | 7.29.0 | low | No | Build/dev/test; [GHSA-4x5r-pxfx-6jf8](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8) |
| @tailwindcss/typography | 0.5.19 | moderate | Yes | Build/dev/test; Propagated via postcss-selector-parser |
| @vitest/mocker | 4.1.9 | moderate | No | Build/dev/test; [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) |
| baseline-browser-mapping | 2.9.19 | moderate | No | Build/dev/test; [GHSA-w5vr-8v7q-w6rv](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) |
| braces | 3.0.3 | high | Yes | Build/dev/test; [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) |
| browserslist | 4.28.1 | high | No | Build/dev/test; [GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx), [GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g) |
| chokidar | 3.6.0 | high | Yes | Build/dev/test; Propagated via braces |
| fast-glob | 3.3.3 | high | Yes | Build/dev/test; Propagated via micromatch |
| lodash | 4.17.23 | high | No | Build/dev/test; [GHSA-r5fr-rjxr-66jc](https://github.com/advisories/GHSA-r5fr-rjxr-66jc), [GHSA-f23m-r3pf-42rh](https://github.com/advisories/GHSA-f23m-r3pf-42rh) |
| micromatch | 4.0.8 | high | Yes | Build/dev/test; Propagated via braces |
| nanoid | 3.3.11 | high | Yes | Build/dev/test; [GHSA-28wg-ghj8-5hjv](https://github.com/advisories/GHSA-28wg-ghj8-5hjv), [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8), [GHSA-xwg4-73v4-xw9w](https://github.com/advisories/GHSA-xwg4-73v4-xw9w) |
| picomatch | 2.3.1, 4.0.3 | high | Yes | Build/dev/test; [GHSA-3v7f-55p6-f55p](https://github.com/advisories/GHSA-3v7f-55p6-f55p), [GHSA-c2c7-rcm5-vvqj](https://github.com/advisories/GHSA-c2c7-rcm5-vvqj) |
| postcss | 8.5.6 | high | Yes | Build/dev/test; [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93), [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q), [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp), [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) |
| postcss-selector-parser | 6.0.10, 6.1.2 | moderate | Yes | Build/dev/test; [GHSA-w9m9-85wc-3x92](https://github.com/advisories/GHSA-w9m9-85wc-3x92), [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) |
| resend | 6.9.3 | moderate | Yes | Runtime dependency; affected UUID APIs unobserved; Propagated via svix |
| rollup | 4.57.1 | high | No | Build/dev/test; [GHSA-mw96-cpmx-2vgc](https://github.com/advisories/GHSA-mw96-cpmx-2vgc) |
| shell-quote | 1.8.3 | critical | No | Build/dev/test; [GHSA-w7jw-789q-3m8p](https://github.com/advisories/GHSA-w7jw-789q-3m8p), [GHSA-395f-4hp3-45gv](https://github.com/advisories/GHSA-395f-4hp3-45gv) |
| source-map-js | 1.2.1 | high | Yes | Build/dev/test; [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) |
| svix | 1.84.1 | moderate | Yes | Runtime dependency; affected UUID APIs unobserved; Propagated via uuid |
| tailwindcss | 3.4.19 | high | Yes | Build/dev/test; Propagated via chokidar, fast-glob, micromatch |
| uuid | 10.0.0 | moderate | Yes | Runtime dependency; affected UUID APIs unobserved; [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) |
| vite | 6.4.1 | high | No | Build/dev/test; [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9), [GHSA-p9ff-h696-f583](https://github.com/advisories/GHSA-p9ff-h696-f583), [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3), [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) |
| vitest | 4.1.9 | moderate | No | Build/dev/test; [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) |
