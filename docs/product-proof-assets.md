# Product Proof asset manifest

These images are static captures of accurate SCRUB Showcase presentation routes. BrightSide Cleaning Co., Maya, Elena, Sarah Johnson, Riverstone Retreat, Linden House, and all displayed records are deterministic fictional Showcase data—not customers, usage metrics, or customer outcomes.

Capture date: 2026-08-03. All screenshots were captured in English from a production build with `VITE_ENABLE_DEMO_MODE=true` and no `VITE_CONVEX_URL`. Showcase shell chrome was removed with `presentation=1`.

The available in-app capture surface produced lossless PNG sources at the viewport's native pixel density rather than an emulated 2× device scale. The PNG sources remain local capture intermediates and are not served or committed. V2A recaptured every view from the production build, raised AVIF/WebP quality, removed Owner onboarding in presentation mode, and keeps production images below their intrinsic dimensions where practical.

## Served assets

| Files (AVIF + WebP fallback) | Source route | Capture viewport | Output dimensions | Focal crop and purpose |
| --- | --- | ---: | ---: | --- |
| `product-proof-owner-dashboard-1200.*` | `/internal/demo/owner?presentation=1` | 1440×900 | 1200×860 | Primary established-business hero view: operational counts, upcoming jobs, and red flags; onboarding hidden in presentation mode |
| `product-proof-owner-dashboard-mobile-415.*` | `/internal/demo/owner?presentation=1` | 430×932 | 415×899 | Purpose-captured narrow established-business Owner Dashboard view used by the hero below 640px |
| `product-proof-owner-jobs-1200.*` | `/internal/demo/owner/jobs?presentation=1` | 1440×900 | 1200×860 | Distinct Owner-section surface focused on the active operating schedule |
| `product-proof-worker-home-375.*` | `/internal/demo/worker?presentation=1` | 390×844 | 375×812 | Worker Home primary mobile view with current Riverstone assignment |
| `product-proof-worker-job-375.*` | `/internal/demo/worker/jobs/riverstone-turnover?presentation=1` | 390×844 | 375×812 | Supporting Riverstone Job Detail view with schedule, access, and add-ons |
| `product-proof-client-home-1024.*` | `/internal/demo/client?presentation=1` | 1024×768 | 1024×768 | Client Home primary view with service, activity, attention, and portal links |
| `product-proof-client-request-timeline-753.*` | `/internal/demo/client/requests/request-scheduled?presentation=1` | 768×1024 | 753×1004 | Supporting request lifecycle and confirmed-schedule view |

Every row represents an AVIF primary asset and a WebP fallback in `packages/frontend/public/images/product-proof/`. No PNG masters are stored in that public directory.

## Regeneration

1. Build the frontend with `VITE_ENABLE_DEMO_MODE=true` and `VITE_CONVEX_URL` unset.
2. Serve the production build locally and open the exact route and viewport above.
3. Confirm presentation mode hides Showcase navigation and the fixture still matches this manifest.
4. Capture a lossless PNG source. Prefer a 2× device scale when the approved browser surface supports it.
5. Apply the documented focal crop without adding annotations or invented UI.
6. Export AVIF first and WebP fallback. V2A uses AVIF quality 68 and WebP quality 88 to protect interface text. Keep the hero desktop under 180 KB, hero mobile under 100 KB, and every other asset under 150 KB.
7. Inspect text sharpness, crop, fictional data, dimensions, and responsive composition before replacing files.
8. Update the capture date or manifest details whenever an asset changes.

Review and regenerate affected images whenever the corresponding Showcase fixture or production presentation component materially changes.
