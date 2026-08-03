# Product Proof presentation manifest

The primary landing-page product visuals are native React HTML/CSS compositions. No interface screenshots are shipped. Browser-rendered text stays crisp at every device pixel ratio, and the compositions simplify responsively instead of scaling desktop screenshots to unreadable dimensions.

## Presentation components

`packages/frontend/src/components/marketing/product-proof/MarketingProductCompositions.tsx` contains four query-free, authentication-free presentation components:

- `MarketingOwnerDashboard`: established BrightSide operation with properties, team, jobs, approvals, red flags, maintenance, and upcoming work; no onboarding content.
- `MarketingOwnerJobs`: a distinct operating schedule with Today, In Progress, Ready Next, Riverstone Retreat, Linden House, and Cedar Ridge Cabin.
- `MarketingWorkerWorkspace`: Elena's Worker Home and a readable Riverstone job/checklist surface, including access context and completed-cleaning photos terminology.
- `MarketingClientPortal`: Sarah Johnson's BrightSide relationship, confirmed Riverstone service, and the Requested → Under Review → Scheduled lifecycle.

The components use a small typed `brightSideMarketingFixture`, Tailwind utilities, and Lucide icons already used by the frontend. They import no Convex hooks, Showcase code, authentication, routing, analytics, page containers, mutation handlers, or asynchronous data.

## Asset status

V2B removed all 14 obsolete AVIF/WebP product-proof screenshots from `packages/frontend/public/images/product-proof/`. No raster asset remains responsible for primary product UI or essential text.

The fictional BrightSide Cleaning Co., Elena, Maya, Sarah Johnson, Riverstone Retreat, Linden House, and Cedar Ridge Cabin records are presentation data—not customers, usage metrics, or customer outcomes. When canonical Showcase facts change, update the typed fixture and its landing-page contract test together.
