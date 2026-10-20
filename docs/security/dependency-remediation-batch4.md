# Batch 4: browser metadata and compatible CSS utilities

October 20, 2026. Baseline `a782c03d7f1c0d8181c8d74ad2ff4d15d938d8f5`, fetched from origin/main; GitHub confirms PR #254 merged at this SHA. Original REPORT.md/INVENTORY.md and PR #252–254 reports were reviewed. Work uses a new isolated worktree and `codex/browser-css-security-batch4`; previous release worktrees, original checkout/QA directories and all five stashes are preserved.

## Selected scope

These nine package names form a compatible frontend build-input group: browser target metadata, CSS/source maps and glob matching. One baseline/candidate CSS and visual matrix exercises them together. No framework, architecture, application code, stylesheet, manifest range, environment, generated Convex file or Vercel setting changes. No packages are added/removed, overrides introduced or audit fixes run.

| Package | Root before -> after | Secondary lock before -> after | Parent constraints |
|---|---|---|---|
| baseline-browser-mapping | 2.9.19 -> 2.11.0 | 2.10.0 -> 2.11.0 | Browserslist now `^2.10.44` |
| browserslist | 4.28.1 -> 4.28.7 | Same | Autoprefixer `^4.28.1`; Babel helper-compilation-targets `^4.24.0` |
| caniuse-lite | 1.0.30001769 -> 1.0.30001806 | 1.0.30001774 -> 1.0.30001806 | New Browserslist minimum `^1.0.30001806` |
| electron-to-chromium | 1.5.286 -> 1.5.393 | 1.5.302 -> 1.5.393 | New Browserslist minimum `^1.5.393` |
| node-releases | 2.0.27 -> 2.0.51 | Same | New Browserslist minimum `^2.0.51` |
| postcss | 8.5.6 -> 8.5.23 | Same | Frontend `^8.4.49`, Vite `^8.5.3`, Tailwind `^8.4.47` |
| nanoid | 3.3.11 -> 3.3.18 | Same | PostCSS now `^3.3.16` |
| source-map-js | 1.2.1 -> 1.2.2 | Same | PostCSS `^1.2.1` |
| picomatch | 2.3.1 -> 2.3.2; two 4.0.3 copies -> 4.0.4 | Same | Anymatch `^2.0.4`, readdirp `^2.2.1`, micromatch `^2.3.1`; tinyglobby `^4.0.3`, Vite `^4.0.2` |

Vitest's already patched nested Picomatch 4.0.4 stays unchanged. Browserslist requires the three metadata updates above; these are supporting changes rather than unrelated database refreshes. Existing update-browserslist-db 1.2.3 already satisfies the new range. Every selected update stays within its parent ranges. Lock edits retain package placement and install classifications; only distribution metadata and the two changed dependency maps are needed. Vite 6.4.3, Rollup 4.59.0, esbuild, React plugin, Tailwind, Babel, runtime SDKs and Undici 6.28.1 are unchanged.

## Advisory inventory and reachability

Severity is from the fresh npm audit, not an assessment of SCRUB exploitability. Six package findings representing thirteen advisory IDs are cleared.

| Package | Advisories / severity | First safe target for this graph | Actual SCRUB behavior |
|---|---|---|---|
| baseline-browser-mapping | [GHSA-w5vr-8v7q-w6rv](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv), moderate | 2.11.0 | Browser target resolution during builds; invalid API options could terminate a Node process. No public user-controlled query/options API found |
| browserslist | [GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx), [GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g), high | 4.28.7 | Autoprefixer and Babel targets; unbounded query caching and malformed custom stats. SCRUB does not accept public browser queries/stats files |
| postcss | [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93), moderate; [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q), high; [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp), moderate; [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849), high | 8.5.23 clears all four | CSS stringify style-close injection and sourceMappingURL file reads. Processes repository CSS at build time, not a public CSS compilation endpoint; generated CSS is an external asset. Untrusted imported CSS/maps would increase risk |
| nanoid | [GHSA-28wg-ghj8-5hjv](https://github.com/advisories/GHSA-28wg-ghj8-5hjv), [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8), [GHSA-xwg4-73v4-xw9w](https://github.com/advisories/GHSA-xwg4-73v4-xw9w), high | 3.3.18 clears all three | PostCSS helper; invalid sizes/custom generators can hang or mis-handle allocation bounds. No application import or public size parameter found; this is not a change to application security-token generation |
| source-map-js | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), high | 1.2.2 | PostCSS source-map consumption; malicious indexed section offsets can block the event loop. Trusted repository/build maps, no public source-map processing API found |
| picomatch | [GHSA-3v7f-55p6-f55p](https://github.com/advisories/GHSA-3v7f-55p6-f55p), moderate; [GHSA-c2c7-rcm5-vvqj](https://github.com/advisories/GHSA-c2c7-rcm5-vvqj), high | 2.3.2 / 4.0.4 | POSIX character-class method injection and extglob ReDoS; Tailwind file discovery/watchers, Vite and test glob matching. Checked-in patterns are trusted; no public glob input found |

Source/import searches found no runtime application use of these APIs in frontend source or Convex functions. Vite imports its declared external Picomatch dependency; this lock patch changes that loaded implementation. No claim is made that replacing an external dependency fixes unrelated embedded implementations. No blanket overrides are used. CSS tooling appears in omit-dev audits through production-listed typography's peer graph; installation classification does not establish an exposed runtime handler. This remediation hardens build/development inputs and does not prove elimination of a previously exploitable public runtime path.

## Remaining investigated build graph

| Finding / installed versions | Advisory / severity | Constraints, next action and mitigation |
|---|---|---|
| @babel/core 7.29.0 | [GHSA-4x5r-pxfx-6jf8](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8), low | SourceMappingURL arbitrary file read during compilation. 7.29.6 is compatible with plugin-react's range but requires parser >=7.29.3, helpers >=7.29.2 and generator >=7.29.6 (currently 7.29.0/7.28.6/7.29.1). Keep this independent compiler dependency group for the next small PR. Trusted source only; no public Babel service found |
| braces 3.0.3 | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), high | Deeply nested pattern stack exhaustion. Registry latest remains 3.0.3; no published fixed braces release. Not safe merely because unpatched |
| micromatch 4.0.8, fast-glob 3.3.3, chokidar 3.6.0, tailwindcss 3.4.19 | High, propagated braces path | Tailwind -> fast-glob -> micromatch `^4.0.8` -> braces `^3.0.3`; Tailwind -> chokidar -> braces `~3.0.2`. Latest fast-glob 3.3.3/micromatch 4.0.8 retain the dependency. Chokidar 6/Tailwind 4 are major migrations, not leaf patches. Picomatch fixes do not fix braces. No safe compatible parent resolution eliminating this path was found |
| postcss-selector-parser 6.1.2 and typography's exact 6.0.10; typography 0.5.19 | [GHSA-w9m9-85wc-3x92](https://github.com/advisories/GHSA-w9m9-85wc-3x92), low on 6.1.2; [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf), moderate | AST recursion and flat-selector quadratic parsing. 6.1.3 only addresses the low finding; >=7.1.6 is needed for both. Registry latest parser 7.1.7 crosses the 6.x consumers; latest typography 0.5.20 still pins 6.0.10. No blind parser override or npm-suggested typography downgrade |

These constrained parsers remain build/development risks. Tailwind content stays `./index.html` and `./src/**/*.{js,ts,jsx,tsx}`; do not add user-supplied patterns/selectors or compile uploaded content. Keep repository/plugin changes reviewed and untrusted builds away from deployment credentials. These mitigations reduce exposure without removing the vulnerable parser. A separately approved Tailwind/parser migration needs its own CSS, plugin, browser and visual review.

## Audit comparison

Commands: clean `npm ci`, `npm audit --json`, `npm audit --omit=dev --json`, graph inspection. Totals count vulnerable packages including propagated parents, not independent exploits.

| Root graph | Before | After |
|---|---|---|
| Complete | 17: 0 critical, 10 high, 6 moderate, 1 low | 11: 0 critical, 5 high, 5 moderate, 1 low |
| Omit dev | 14: 0 critical, 9 high, 5 moderate, 0 low | 10: 0 critical, 5 high, 5 moderate, 0 low |
| Standalone secondary lock | 16: 0 critical, 11 high, 4 moderate, 1 low | 10: 0 critical, 6 high, 3 moderate, 1 low |

Remaining eleven root names: @babel/core, @tailwindcss/typography, braces, chokidar, fast-glob, micromatch, postcss-selector-parser, resend, svix, tailwindcss, uuid. The mail chain remains Resend 6.9.3 -> Svix 1.84.1 -> UUID 10.0.0 ([GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq), moderate, UUID >=11.1.1); assess an appropriate parent update in a separate runtime mail PR, not a forced UUID override.

## CSS, browser and test evidence

Baseline and candidate were built in this new worktree with identical synthetic process-only environment values (`VITE_CONVEX_URL=https://synthetic.convex.cloud`, `VITE_ENABLE_DEMO_MODE=true`). Baseline dist was copied before lock changes. No real backend, production assets, customer data or shared QA deployment was accessed. The root build wrapper was not run because it deploys Convex.

Generated assets are byte-identical across the two builds:

| Artifact | Bytes | SHA-256 (both builds) |
|---|---:|---|
| index-BspI5zir.css | 96,592 | b9de48dd961a80325915e8b7f9dd2747ef5071635c5b2f390d3b613b373a1781 |
| index-CdUjQsvI.js | 2,511,708 | 26af16d15556c233a66fb992a813fa38e45c95d015cd3670d747e2ab959504c3 |

Default Browserslist target output changes as expected with newer data (for example Chrome 143/144 -> 149/150, Safari 26.1/26.2 -> 26.3/26.4/26.5). This changes metadata results, not this build's emitted CSS or JS. It is not proof of identical output for future stylesheets or every browser.

Headless Chrome compared 28 baseline/candidate screenshot pairs across 1440x900 and 390x900: landing/navigation; Showcase; synthetic owner dashboard, jobs and calendar; worker job detail and checklist; client home, requests, new-request form, populated request review and Radix action dialog; English/Spanish login. Language preference persists through reload. Every page has zero document horizontal overflow and no JavaScript page exceptions. Twenty-seven pairs have zero differing pixels. The desktop full landing page has 21 differing pixels (0.000155%, bounding box x942–949/y3071–3150), with identical dimensions/assets and no observed layout change. This is not claimed as exact pixel equality for all pages. Representative mobile Radix dialog was visually inspected.

The harness uses an isolated browser, fixed date, loopback static server, blocked external HTTP/WebSockets and disabled animations for screenshots. An initial harness fallback served HTML for missing analytics JavaScript; it was corrected to return 404 for missing file assets before both complete captures were repeated. No product code changed to accommodate the harness.

Reviewable evidence: [all 28 pixel comparisons](evidence/batch4/pixel-comparison.json), [baseline mobile Radix dialog](evidence/batch4/baseline-390-request-dialog.png), [candidate mobile Radix dialog](evidence/batch4/candidate-390-request-dialog.png), [baseline desktop calendar](evidence/batch4/baseline-1440-_internal_demo_owner_calendar.png), [candidate desktop calendar](evidence/batch4/candidate-1440-_internal_demo_owner_calendar.png). Full local screenshots and audit JSON remain in the task's batch4-evidence artifact directory.

Limitations: synthetic Showcase views do not validate authenticated live owner/worker/client mutations. Public company microsites, booking backend integration and Vercel rewrites use mocked HTTP/SSR/full-suite coverage, not a live hosted browser round trip. Native form selects and a Radix dialog are exercised; every production dropdown/modal state is not exhaustively captured. No supported dark-mode configuration or theme switch was found in the checked-in Tailwind/application source, so no dark-mode parity claim is made. External webfonts were blocked equally; screenshots compare fallback-font layouts. No claim of live cloud or every-browser parity.

Four new focused tests cover explicit Browserslist targeting, real Autoprefixer prefixes and source-map round trip; both Picomatch majors' normal content patterns and prototype-method class rejection; Nanoid zero-sized generator termination and invalid allocation bounds in a five-second bounded subprocess. They run in the existing CI suite. No new dependency or arbitrary timeout increase was introduced.

Local Windows Node24.13.1/npm11.8.0: clean candidate root install, four new focused tests, five focused files/21 tests (including existing authorization, DialogShell, microsite and sitemap checks), backend/frontend TypeScript and frontend build passed. An initial concurrent full suite hit the existing clientResources authorization test's 5s timeout (1 failure/1,179 passes); it passed in isolation with unchanged timeout. Final complete-suite, clean frontend/root reproducibility, exact head, CI and automatic preview results are recorded in the PR description; only those final results should gate merging. Existing bundle-size, TypeScript dependency source-map and launcher deprecation warnings remain; the old browser-data age warning is resolved by the required metadata update.

Final local full suite: **178 files / 1,184 tests passed**, including the four new checks. Clean frontend-directory install also passed (297 installed / 299 audited; 8 findings: 5 high, 2 moderate, 1 low), with selected resolutions loaded from the parent workspace lock and both lock hashes unchanged. This frontend-selected set excludes root-only SDKs and differs from the standalone secondary graph and the root omit-dev graph.

Repeated clean root install passed (373 installed / 375 audited), installed dependency tree validated without invalid ranges, and the four new focused tests passed again afterward. Both lockfiles kept identical SHA-256 hashes across frontend and repeated root clean installs: root `8E4C80D2E43EC619424072F20E21C6D901FF0913B5CEDF37E40A35C9F69735B4`; secondary `D8A363D98E85C4F2A546D7B5A7A0AAD0F87CEAB47EC812C690C40E76FE705242`. Structural comparison confirms eleven intended package entries per lock, no package addition/removal and unchanged application manifest ranges. Final fresh full/omit-dev audits repeated the 11/10 totals above.

## Vercel install graph and release

Previously confirmed production project `scrubadub-app-frontend` settings: root `packages/frontend`, framework Vite, install/build overrides OFF, output `dist`, include outside root enabled. This task's explicit read-only inspection again returned team `scrubadubs-projects` 403; no local Vercel CLI is installed. These are previously confirmed settings, not fresh successful live attestation. The cached production install log does not prove exact lockfile/versions. Both candidate lockfiles are patched rather than assuming root-only coverage.

GitHub CI installs from repository root on Ubuntu/Node20 and tests/builds that workspace graph. Frontend-directory npm recognizes the parent workspace lock but installs the frontend-selected set, excluding root-only SDKs. Standalone secondary lock still differs: Convex 1.32.0 -> ws 8.18.0 and embedded ws, versus workspace Convex 1.31.7. The external ws and bundled Convex follow-up from PR #252–254 remains separate; no leaf override claim. Browser Convex uses browser WebSocket; Node ConvexHttpClient handlers use HTTP and no public ws server was found. A future authorized cache-disabled preview with cwd/npm/lock hashes/installed graph is needed for conclusive hosted attestation. No project, infrastructure, setting, deployment command or shared QA data change was made.

GO only after exact-head CI and preview results are acceptable and the final test/reproducibility results pass. The documented live-cloud/hosted-graph limitations do not materially block compatible build-only resolutions when both lockfiles are patched and baseline/candidate artifacts are identical.

After separate release approval: merge, rebuild frontend through the normal Vercel Git pipeline from the merged SHA, prefer a clean/cache-disabled build with version evidence, confirm normal production flags (do not deploy the synthetic demo settings), then smoke landing/navigation/login/language, Showcase, authorized owner jobs/calendar, worker detail/checklist, client request flow, company/cleaner microsites/booking, dialog/dropdown layouts, giveaway metadata and sitemap at desktop/mobile. No Convex/backend deployment, schema migration or Blob operation is required. Do not invoke root deploy wrapper solely for this batch.

Rollback: promote the previous verified frontend deployment if urgent; revert this PR's lock/test/config changes, clean install and rebuild normally. No data/schema rollback; old build-input advisories return. Prefer a forward fix when feasible. Next small remediation group: Babel core and its required compatible compiler internals, then separately runtime mail SDK; keep Tailwind/parser migration and hosted embedded-ws investigation explicit rather than forced.
