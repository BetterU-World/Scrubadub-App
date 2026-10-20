# Batch 2: development and test launchers

Baseline: `e572f887cd258e5e6e515b9ca53c2a15c782787b` (PR #252 merge). Revalidated October 20, 2026 against the root lock. This is the dev/test-launcher group from the original REPORT.md/INVENTORY.md sequence, updated for current advisory data.

## Selected changes and actual exposure

| Package / chain | Locked before → after | Advisory and reachability | Compatibility / production effect |
|---|---|---|---|
| root devDependency concurrently 8.2.2 → shell-quote | 1.8.3 → 1.11.0 | Critical object-token command injection [GHSA-w7jw-789q-3m8p](https://github.com/advisories/GHSA-w7jw-789q-3m8p); High parse DoS [GHSA-395f-4hp3-45gv](https://github.com/advisories/GHSA-395f-4hp3-45gv). SCRUB's dev script has two static commands, no placeholders. Concurrently's argument expansion calls quote on CLI strings; no attacker-controlled object tokens or parse input from application requests was found. | Satisfies unchanged ^1.8.1 range; no override or concurrently update. Object-token validation intentionally throws on unsafe inputs. Development launcher only; not part of app runtime or frontend build command. |
| root devDependency concurrently → lodash | 4.17.23 → 4.18.0 | High template imports-key injection [GHSA-r5fr-rjxr-66jc](https://github.com/advisories/GHSA-r5fr-rjxr-66jc); Moderate unset/omit array-path pollution [GHSA-f23m-r3pf-42rh](https://github.com/advisories/GHSA-f23m-r3pf-42rh). Inspected concurrently uses collection/default/get/escapeRegExp utilities, not the vulnerable APIs; no SCRUB runtime import found. | Satisfies unchanged ^4.17.21 range. Same major minor update; exercised through actual command handling/logging/failure lifecycle. No production runtime change. |
| root devDependency vitest → @vitest/mocker | 4.1.9 → 4.1.11, with seven matching @vitest internal packages | Moderate redirect mock file disclosure [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9), reported on both parent and mocker. Public interceptor plugins on a reachable dev-server socket are the unauthenticated path; Vitest's browser RPC requires a token. SCRUB uses vitest run, no browser/UI/custom interceptor server configured. | First patched 4.x release, preserving exact-pin policy. Existing Vite 6.4.1 is retained and exports the isFileLoadingAllowed helper required by the fixed mocker. Test execution can change; complete suite/CI are the regression gate. Vite production build implementation remains unchanged. |

These are dependency risks removed from developer/CI machines, not demonstrated public production exploits. No SDK, Convex, storage, CSS, Vite or Rollup resolution changes are included. Undici remains 6.28.1. No suppression or override is introduced.

### Why shell-quote differs from the original plan

The original 1.9.0 target fixes the original two findings but triggers a different current Critical advisory: [GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv), affected >=1.8.4 <1.11.0. It concerns a line terminator in a token after a comment token. The final target **1.11.0** is the first published fix and clears all returned shell-quote advisories. This third advisory did not apply to baseline 1.8.3 and is an avoided upgrade regression, not an extra baseline finding removed. Tests cover both injection boundaries without executing malicious shell text.

Vitest's audit recommends 4.1.12, but 4.1.11 is the first patched version for the actual advisory; the final audit confirms no Vitest/mocker finding. Native Vite/esbuild/Rollup packages and every nonselected dependency are retained. Incidental Chai/tinyrainbow resolver updates were excluded because the existing versions satisfy the unchanged ranges.

## Audit evidence

Fresh before/after commands: `npm audit --package-lock-only --json` and `npm audit --package-lock-only --omit=dev --json`. Nonzero exit status is expected for the residual findings. Npm vulnerable-package counts include propagated parents, not independent exploits.

| Scope | Critical | High | Moderate | Low | Total |
|---|---:|---:|---:|---:|---:|
| Full before | 1 | 13 | 8 | 1 | 23 |
| Full after | 0 | 12 | 6 | 1 | 19 |
| Omit-dev before | 0 | 9 | 5 | 0 | 14 |
| Omit-dev after | 0 | 9 | 5 | 0 | 14 |

Eliminated package findings: shell-quote, lodash, vitest and @vitest/mocker. This removes five distinct baseline advisories (Vitest's single advisory appears against two packages). No newly reported package finding is introduced. Production-only advisory objects are byte-for-byte identical as parsed JSON before/after.

## Files and verification

- package.json: only exact Vitest devDependency pin changes.
- package-lock.json: root pin metadata plus Vitest/seven internal packages, Lodash and shell-quote. No packages added/removed; all changed installed package entries are dev-only.
- vitest.config.ts: includes the new tooling integration test in the existing default suite so current GitHub Actions executes it.
- scripts/toolingSecurity.test.ts and scripts/fixtures/launcher-child.cjs: nine focused tests. Synthetic subprocesses only; never start Convex/Vite services. Coverage includes benign parallel commands, quoted arguments/placeholder expansion, nonzero exit propagation, sibling termination, unsafe object/comment tokens across four line separators, string parse/quote round trip and bounded large-input parsing in a subprocess.
- This evidence document and residual inventory.

Local environment: Windows, Node 24.13.1/npm 11.8.0; existing hosted CI uses Ubuntu/Node 20. Full application tests exercise Vitest mocks, Convex test infrastructure and frontend utilities. The TypeScript checks use the existing backend/frontend configurations; the new scripts test is compiled/executed by Vitest.

| Validation | Local result |
|---|---|
| Clean root npm ci, lifecycle scripts enabled | Passed; 373 packages installed |
| Second clean npm ci / reproducibility | Passed; both root and secondary frontend lock hashes unchanged |
| Focused tooling integration | 9 tests passed; repeated successfully after second clean install |
| Full npm test | 176 files / 1,178 tests passed |
| Backend and frontend npm run typecheck | Passed |
| npm run build:frontend | Passed; Vite 6.4.1 retained |
| Final npm audit and npm audit --omit=dev | 19 and 14 findings respectively; no selected-package findings |
| Dependency graph / whitespace checks | Passed; only intended dev-only packages and root pin metadata change |

Hosted CI status is recorded in the PR description once the existing GitHub Actions run completes. Existing Browserslist age, bundle-size and TypeScript missing-sourcemap warnings remain; the synthetic subprocess tests also expose tree-kill's util._extend deprecation warning on Node 24. None failed validation, and unrelated dependency updates were not added to silence them.

## Remaining risks and follow-up order

1. **Vite/dev-server and related build utilities, separate PR:** investigate Vite 6.4.3, Rollup 4.59.0, Babel 7.29.6, Browserslist 4.28.7 and baseline-browser-mapping 2.11.0. These process repository inputs or expose a developer server; no public production compiler/server path was found in the original audit, and current scripts/configuration preserve those boundaries. Keep dev servers unexposed; review third-party build inputs. Revalidate patches and release diffs at implementation time.
2. **CSS/source-map/glob tooling, separately tested build PR:** PostCSS 8.5.23, nanoid 3.3.18, source-map-js 1.2.2 and picomatch 2.3.2/4.0.4 are original compatible targets outside current returned ranges. Production-only audit includes many of these because typography's production-listed peer graph brings Tailwind tooling into it; that does not make them runtime HTTP handlers. Verify CSS output, source maps and production artifacts before merging.
3. **Constrained CSS residuals:** braces latest published version is still 3.0.3, with no patch for nested-pattern stack exhaustion. Its propagated chokidar/micromatch/fast-glob/Tailwind findings remain. Use fixed reviewed content globs (currently index.html and src patterns), do not accept user-supplied patterns, and keep untrusted builds away from deployment secrets. Tailwind 4 is a major CSS migration, not an automatic audit fix. Selector-parser requires 7.1.6 to clear all current ranges, crossing 6.x consumers/exact pins; current typography 0.5.20 still pins 6.0.10. No blind parser override or downgrade.
4. **Mail SDK, separate runtime PR:** Resend → Svix → UUID remains. A parent update can remove the UUID chain; do not force UUID across the pinned range. Current SCRUB mail sends do not exercise the reported v3/v5/v6 buffer APIs. Test provider behavior independently from this tooling change.
5. **Hosted graph/embedded ws follow-up:** the separate frontend lock and previously documented Convex 1.32.0 embedded ws issue remain unchanged. Root clean installs use Convex 1.31.7. No hosted dependency attestation or environment changes were attempted here; no claim that an installed-package override patches embedded code.

## Production impact and rollback

No dedicated production deployment is required to activate these developer/CI package fixes: subsequent clean root installs and CI use the committed versions. Build environments that install devDependencies receive them; runtime dependency resolutions and Vite/CSS build tool versions are unchanged. A normal Vercel Git preview may run for the draft PR, but this task issues no deployment command, creates no infrastructure and does not modify shared QA/production settings or data. Root npm run build is deliberately not used because it invokes Convex deploy; validation uses build:frontend.

Rollback: revert this PR's package.json/package-lock.json and tooling-test/config changes, then clean npm ci and rerun CI. No schema/data rollback or Convex backend deployment is required for this tooling-only change. The old launcher/test advisories return on rollback. Recheck advisory data before choosing a rollback versus a forward patch.

## Exact remaining package inventory

Generated from the final root audit below. Original audit artifacts remain the broader path/exposure reference; current exact paths/advisories are retained in the audit evidence. No residual finding is silently accepted or suppressed.

| Package | Installed version(s) | Severity | In omit-dev | Advisory source / propagated cause |
|---|---|---|---|---|
| @babel/core | 7.29.0 | low | No | [GHSA-4x5r-pxfx-6jf8](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8) |
| @tailwindcss/typography | 0.5.19 | moderate | Yes | Via postcss-selector-parser |
| baseline-browser-mapping | 2.9.19 | moderate | No | [GHSA-w5vr-8v7q-w6rv](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) |
| braces | 3.0.3 | high | Yes | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) |
| browserslist | 4.28.1 | high | No | [GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx), [GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g) |
| chokidar | 3.6.0 | high | Yes | Via braces |
| fast-glob | 3.3.3 | high | Yes | Via micromatch |
| micromatch | 4.0.8 | high | Yes | Via braces |
| nanoid | 3.3.11 | high | Yes | [GHSA-28wg-ghj8-5hjv](https://github.com/advisories/GHSA-28wg-ghj8-5hjv), [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8), [GHSA-xwg4-73v4-xw9w](https://github.com/advisories/GHSA-xwg4-73v4-xw9w) |
| picomatch | 2.3.1, 4.0.3 | high | Yes | [GHSA-3v7f-55p6-f55p](https://github.com/advisories/GHSA-3v7f-55p6-f55p), [GHSA-c2c7-rcm5-vvqj](https://github.com/advisories/GHSA-c2c7-rcm5-vvqj) |
| postcss | 8.5.6 | high | Yes | [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93), [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q), [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp), [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) |
| postcss-selector-parser | 6.0.10, 6.1.2 | moderate | Yes | [GHSA-w9m9-85wc-3x92](https://github.com/advisories/GHSA-w9m9-85wc-3x92), [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) |
| resend | 6.9.3 | moderate | Yes | Via svix |
| rollup | 4.57.1 | high | No | [GHSA-mw96-cpmx-2vgc](https://github.com/advisories/GHSA-mw96-cpmx-2vgc) |
| source-map-js | 1.2.1 | high | Yes | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) |
| svix | 1.84.1 | moderate | Yes | Via uuid |
| tailwindcss | 3.4.19 | high | Yes | Via chokidar, fast-glob, micromatch |
| uuid | 10.0.0 | moderate | Yes | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) |
| vite | 6.4.1 | high | No | [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9), [GHSA-p9ff-h696-f583](https://github.com/advisories/GHSA-p9ff-h696-f583), [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3), [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) |
