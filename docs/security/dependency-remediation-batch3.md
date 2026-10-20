# Dependency remediation batch 3: Vite and Rollup

Audit date: October 20, 2026. Baseline: `39ab5ddc515c8184d61de3121d9918d2f5d7f8a0` (`origin/main`, PR #253 merged). This follows the original October 20 REPORT.md/INVENTORY.md and the checked-in PR #252/#253 security reports. No application code, manifests, environment files, Vite configuration, serverless routes or Convex files change.

## Scope and compatibility

| Resolution | Before | After | Path and reason |
|---|---|---|---|
| Vite, both lockfiles | 6.4.1 | 6.4.3 | Frontend devDependency `vite: ^6.0.7`; also shared by plugin-react 4.7.0 and Vitest 4.1.11 |
| Root Rollup | 4.57.1 | 4.59.0 | Vite -> Rollup (`^4.34.9`); matching versions/integrities for all 25 optional native packages |
| Secondary frontend Rollup | 4.59.0 | unchanged | Already patched |
| esbuild | 0.25.12 / 0.27.0 | unchanged | Vite / root Convex respectively; neither is flagged by this audit |

These are existing-range patch/minor resolutions, with no override, suppression, package addition/removal or major migration. Root lock changes are limited to Vite's three distribution fields and Rollup/native distribution fields plus matching Rollup optional dependency versions. Secondary lock changes are only Vite's three distribution fields. The only configuration change adds two synthetic regression tests to the existing Vitest suite.

Risk: Rollup participates in production JavaScript/CSS/HTML generation; native binaries must match on Windows and Linux. Vite's tighter development-server filesystem checks could reject previously permitted unsafe paths. Normal React transforms, assets, build plugin output and tests are validated below. Unrelated Babel, browser database, CSS, Convex, mail and storage updates are deliberately separate.

## Remediated advisories and actual exposure

| Advisory | Severity | Affected behavior / SCRUB reachability | First patched 6.x/4.x |
|---|---|---|---|
| [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9) | Moderate | Optimized dependency source-map path traversal; exposed Vite dev server and predictable sensitive `.map` file required | Vite 6.4.2 |
| [GHSA-p9ff-h696-f583](https://github.com/advisories/GHSA-p9ff-h696-f583) | High | Dev-server WebSocket `fetchModule` arbitrary file access; network access to the development server required | Vite 6.4.2 |
| [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3) | Moderate | Windows editor endpoint UNC path / NTLM disclosure; Vite bundles the launcher fix. No UNC/NTLM probe was performed | Vite 6.4.3 |
| [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) | High | Windows NTFS alternate data stream / short-name bypass of dev-server filesystem deny checks | Vite 6.4.3 |
| [GHSA-mw96-cpmx-2vgc](https://github.com/advisories/GHSA-mw96-cpmx-2vgc) | High | Rollup output filename traversal; requires attacker-controlled entry/output names during a build | Rollup 4.59.0 |

Vite is a frontend build/development tool, not a production HTTP handler. Checked-in configuration has no `server.host` override; developers can still expose it through flags, forwarding or tunnels. Keep it on loopback. SCRUB deploys static frontend artifacts and separate Vercel API handlers; Convex functions do not invoke Vite. No publicly reachable Vite server or user-controlled Rollup entry/plugin filename was found. The custom giveaway plugin emits the fixed `giveaway/index.html` filename. Repository/plugin compromise or unsafe developer exposure remains a relevant build/development threat, so these compatible patches are worthwhile without claiming production exploitability.

## Audit evidence

Commands: `npm audit --json`, `npm audit --omit=dev --json`, clean `npm ci`, `npm ls vite rollup esbuild convex ws --all`. Audit totals count vulnerable package findings, including propagated parent findings, not independent exploits.

| Graph | Before | After |
|---|---|---|
| Root complete | 19: 0 critical, 12 high, 6 moderate, 1 low | 17: 0 critical, 10 high, 6 moderate, 1 low |
| Root omit-dev | 14: 0 critical, 9 high, 5 moderate, 0 low | Unchanged: 14 |
| Standalone secondary frontend lock | Vite 6.4.1; Rollup already 4.59.0 | 16: 0 critical, 11 high, 4 moderate, 1 low; Vite/Rollup clear |

All five selected advisory records disappear from the root report; neither Vite nor Rollup remains flagged. Production-only findings include build-time CSS tooling through production-listed typography peers; that classification alone does not establish a runtime attack surface. Undici 6.28.1 and PR #253 launcher/test resolutions are retained.

## Vercel and workspace graph

Previously confirmed production dashboard settings for `scrubadub-app-frontend`: Root Directory `packages/frontend`, Framework Vite, Install Command override OFF (automatic npm), Build Command override OFF (`npm run build` -> `vite build`), Output Directory `dist`, Include files outside Root Directory enabled. This task's read-only project inspection again returned 403 for `scrubadubs-projects`; these settings are prior confirmation, not a newly successful live read. No Vercel CLI/token is available locally. No settings, infrastructure or shared QA data were changed.

The earlier successful production log at `3feb03e` restored cache and reported “up to date in 1s”; it does not identify installed versions or conclusively select a lockfile. Local `npm ci` from the frontend directory recognizes the parent npm workspace/root lock. GitHub Actions explicitly installs at root on Ubuntu/Node 20, then runs backend/frontend TypeScript, Vitest and frontend build. That verifies the root workspace graph, not every possible Vercel checkout/cache graph. Both lockfiles therefore patch Vite, and both have Rollup 4.59.0. A future authorized cache-disabled preview should print working directory, npm version, lockfile hashes and `npm ls vite rollup convex ws --all` before building to attest the hosted graph. No deployment command is issued by this task.

The secondary standalone graph still locks Convex 1.32.0 -> ws 8.18.0. Root workspace installs resolve Convex 1.31.7 without that separate ws node. The secondary audit reports [GHSA-58qx-3vcg-4xpx](https://github.com/advisories/GHSA-58qx-3vcg-4xpx) (moderate, patched 8.20.1) and [GHSA-96hv-2xvq-fx4p](https://github.com/advisories/GHSA-96hv-2xvq-fx4p) (high, patched 8.21.0). Convex 1.32.0 also embeds ws in its distributed Node code, as documented in PR #252: changing only an external ws lock entry cannot prove that bundle is fixed. SCRUB's browser uses the browser WebSocket implementation, not this Node ws server. Node ConvexHttpClient use in Vercel routes is HTTP; no public ws listener was found in those handlers. A separate Convex parent/bundled-code investigation and hosted graph attestation is required; no claim of remediation or definite production exploitability is made here.

## Validation

Local: Windows, Node 24.13.1/npm 11.8.0. No root `npm run build` (it invokes Convex deploy), no real customer content and no production/QA mutation.

| Check | Result |
|---|---|
| Clean root `npm ci`, lifecycle scripts enabled | Passed, 373 packages |
| Clean `npm ci` from frontend working directory | Passed, 297 packages; parent root workspace lock selected, Convex 1.31.7, Vite 6.4.3 / Rollup 4.59.0; both lock hashes unchanged |
| Repeated clean root install / reproducibility | Passed; both lock hashes unchanged; focused security tests passed again; only intended 27 root package entries and one frontend package entry differ from baseline |
| Focused build security tests | 2 passed: local module/HMR transform and private synthetic `.env` denial; valid Rollup output and rejected traversal output |
| Microsite/sitemap/runtime, landing/metadata, Showcase/client focused tests | 8 files / 38 tests passed, mocked/synthetic inputs |
| Complete `npm test` | 177 files / 1,180 tests passed |
| Backend and frontend `npm run typecheck` | Passed |
| `npm run build:frontend` | Passed, Vite 6.4.3, giveaway metadata output retained |
| Serverless route bundling | mini-site.ts and sitemap.ts bundled successfully with esbuild, Node/ESM target |
| Production-build browser smoke | Headless Chrome at loopback, 1440x1000 and 390x844; landing, Showcase and synthetic owner/worker/client pages rendered; no page exceptions or document horizontal overflow |
| EN/ES | Login language switch changes displayed text and persists across reload at both viewport sizes. SCRUB uses language preference, not separate locale URL prefixes |

Browser build used only synthetic `VITE_CONVEX_URL` and `VITE_ENABLE_DEMO_MODE=true` in process environment; all external HTTP and WebSockets were blocked. No deployment uses these flags. Representative Showcase dashboards are not evidence of authenticated live owner/worker/client mutations. Public company microsites and Vercel rewrites are covered by mocked HTTP/SSR tests and route bundling, not a live hosted browser/backend round trip. Real authenticated cloud flows remain unverified in this task; no shared deployment was repurposed.

Existing nonfatal warnings: outdated caniuse-lite database, large bundle chunk, missing TypeScript dependency source map, Node 24 `util._extend` deprecation in the existing launcher dependency. An initial repeat install encountered a Windows file lock while preview was running; preview was stopped before repeating the install. An intermediate browser attempt overlapped the second build's replacement of dist; browser checks were repeated against the completed stable build.

Lock reproducibility, final dependency tree, CI and automatic preview status are recorded in the PR description against its exact head SHA. Review those final statuses before merging.

Final SHA-256 lock hashes after both install contexts: root `CA2588978C16BBF7B01E1CEFF6788BE1F8D2AB1BF80420C875ABDAAF3F0F9C1A`; frontend `AB1E08C9FAAED3058F6165F23D8FC693C28592711605878AC10C2B193FFC1BCA`. Original checkout/untracked QA directories, prior release worktrees and all five Git stashes remain unchanged.

## Residual findings and next order

Root residual package inventory (installed versions unchanged):

| Packages | Severity | Follow-up |
|---|---|---|
| @babel/core 7.29.0 | Low | Compatible build-tool patch, separate tested group |
| baseline-browser-mapping 2.9.19 | Moderate | Browser metadata group |
| browserslist 4.28.1 | High | Browser metadata group |
| postcss 8.5.6, nanoid 3.3.11, source-map-js 1.2.1, picomatch 2.3.1/4.0.3 | High | Compatible CSS/build patches with CSS/artifact regression |
| braces 3.0.3, chokidar 3.6.0, fast-glob 3.3.3, micromatch 4.0.8, tailwindcss 3.4.19 | High | Constrained Tailwind/glob graph; current audit has no compatible resolution for all reported ranges. Review Tailwind 4 separately; restrict trusted content globs and build inputs meanwhile |
| @tailwindcss/typography 0.5.19, postcss-selector-parser 6.0.10/6.1.2 | Moderate | Parser pin/major compatibility investigation; no blind override or downgrade |
| resend 6.9.3, svix 1.84.1, uuid 10.0.0 | Moderate | Separate runtime mail SDK PR; verify relevant UUID APIs and parent upgrade |

The existing batch 2 report contains the individual residual advisory IDs and broader exposure analysis; none of these resolutions changed. Prioritize compatible browser metadata and CSS patches next, independently from a Tailwind major migration and mail SDK changes. The secondary ws/embedded Convex risk is a separate graph-specific follow-up. No finding is suppressed or claimed fixed merely by moving it out of an audit graph.

## Release recommendation, deployment and rollback

GO for this narrow remediation once the exact PR head's existing CI is green. Hosted graph uncertainty and lack of live authenticated cloud checks do not materially block these compatible build-only patches: both candidate lockfiles are patched, local production artifacts and representative UI pass, and runtime SDK/application behavior is unchanged. A failed preview or new build regression is NO-GO until investigated.

After approval (not performed here): merge; let the normal production Vercel Git build use the merged commit and committed lockfiles; prefer an authorized clean/cache-disabled rebuild to attest versions; confirm build success, fixed Vite/Rollup graph and normal production environment flags; then smoke landing, login/language, Showcase, representative authorized owner/worker/client flows, public company/cleaner microsites, giveaway metadata and sitemap on desktop/mobile. No standalone Convex deployment, schema migration, asset rewrite or Blob operation is required by this PR. Do not run the root deploy wrapper solely for this tooling patch.

Rollback: promote the previously verified frontend deployment if urgent; revert this PR's two lockfiles and test/config additions, clean install and rebuild through the normal pipeline. No data/schema rollback is needed. Rolling back dependencies restores the development/build advisories; prefer a forward fix where practical. No merge or production deployment is authorized by this report.
