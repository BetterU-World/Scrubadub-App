# Sprint 2: Property Inventory System — MVP Plan

## Current State

Properties already track flat inventory fields: `towelCount`, `sheetSets`, `pillowCount`, `linenCount`, `linenTypes`, `supplies` (string array). These are "property characteristics" — they describe what the property *has*, not what needs restocking. No consumption tracking, no cleaner interaction, no par levels.

---

## 1. Schema Design

**Recommendation: Option (c) — Separate `inventoryTemplates` table + embedded `inventoryItems` array on property.**

Why:
- A separate `inventoryItems` table per-property would create too many documents and queries for a beta MVP.
- Pure embedding on the property doc works initially but blocks future template sharing.
- A **hybrid** gives us the best of both: company-level templates for quick setup + per-property overrides embedded on the property doc.

### New Tables

```
inventoryTemplates: defineTable({
  companyId: v.id("companies"),
  name: v.string(),                    // e.g. "STR Standard", "Luxury Beach House"
  items: v.array(v.object({
    name: v.string(),                  // "Toilet Paper"
    category: v.string(),             // "bathroom", "kitchen", "bedroom", "general"
    parLevel: v.number(),             // target quantity (e.g. 4 rolls)
    required: v.boolean(),            // must be present every turnover?
    restockResponsibility: v.optional(v.string()), // "owner", "cleaner", "manager"
    notes: v.optional(v.string()),
  })),
  isDefault: v.optional(v.boolean()), // one default template per company
  createdAt: v.number(),
}).index("by_companyId", ["companyId"])
```

### New Field on `properties` Table (additive)

```
inventoryItems: v.optional(v.array(v.object({
  name: v.string(),
  category: v.string(),
  parLevel: v.number(),
  required: v.boolean(),
  currentQty: v.optional(v.number()),     // last known quantity
  lastCheckedAt: v.optional(v.number()),  // timestamp of last inventory check
  lastCheckedBy: v.optional(v.id("users")),
  restockResponsibility: v.optional(v.string()),
  notes: v.optional(v.string()),
})))

inventoryTemplateId: v.optional(v.id("inventoryTemplates")) // source template, if applied
```

### New Field on `jobs` Table (additive)

```
inventoryChecklist: v.optional(v.array(v.object({
  name: v.string(),
  category: v.string(),
  parLevel: v.number(),
  required: v.boolean(),
  reportedQty: v.optional(v.number()),    // cleaner-reported quantity
  status: v.optional(v.string()),         // "ok", "low", "out", "restocked"
  note: v.optional(v.string()),
  checkedAt: v.optional(v.number()),
})))
```

**Why snapshot on the job?** Same pattern as `propertySnapshot` for shared jobs. Gives us:
- Historical record of what was checked per job
- Decouples job review from live property state
- Lets cleaners report without mutating property data directly

---

## 2. Required Fields Per Inventory Item

| Field | Type | Required | Purpose |
|---|---|---|---|
| `name` | string | yes | Item name ("Toilet Paper") |
| `category` | string | yes | Grouping ("bathroom", "kitchen", "bedroom", "general") |
| `parLevel` | number | yes | Target quantity to maintain |
| `required` | boolean | yes | Must be present every clean? |
| `currentQty` | number | no | Last known quantity (property-level only) |
| `restockResponsibility` | string | no | "owner" / "cleaner" / "manager" |
| `notes` | string | no | Special instructions |

Intentionally omitted: unit, cost, vendor, SKU — those are enterprise features.

---

## 3. Custom Items & Templates

### MVP (Sprint 2):
- **Custom items per property**: Yes. Owners can add/remove/edit items directly on the property.
- **Company templates**: Yes. One or more templates per company. Owner creates a template, applies it to properties (copies items). Properties can then diverge.
- **Default template**: One template can be marked `isDefault` — auto-suggested when creating a new property.

### Deferred (Future):
- Global/system templates (SCRUB-provided starter templates)
- Template sync (push template changes to all linked properties)
- Template marketplace

---

## 4. Cleaner Interaction with Inventory

**MVP cleaner capabilities:**
- **View inventory checklist** on job (read items + par levels)
- **Report status per item**: "ok" / "low" / "out" / "restocked"
- **Report quantity**: optional numeric field per item
- **Add note per item**: free text for issues

**NOT in MVP:**
- Edit property par levels (owner-only)
- Add new items to property (owner-only)
- Purchase/restock workflow

**UX**: Inventory checklist appears as a collapsible section on `CleanerJobDetailPage` / `CleaningFormPage`, similar to existing form sections. Cleaner fills it as part of job completion.

---

## 5. Inventory on Jobs

**Recommendation: Snapshot at job start + per-job checklist.**

Flow:
1. When cleaner starts job (`startJob` mutation), copy property's `inventoryItems` → job's `inventoryChecklist`
2. Cleaner fills checklist during job (reports qty/status per item)
3. On job completion (`completeJob`), optionally write back `currentQty` + `lastCheckedAt` to property doc
4. Owner reviews inventory alongside form submission

This mirrors the existing form/formItems pattern but is simpler (embedded array vs separate table).

---

## 6. Owner UI Recommendations

### Phase 1: Property-Level Inventory Tab
- New "Inventory" tab on `PropertyDetailPage` (alongside existing info)
- Table of items with name, category, par level, current qty, status indicator
- Add/edit/remove items inline
- "Apply Template" button to copy from company template

### Phase 2: Template Manager
- New page: `InventoryTemplatesPage` (linked from Settings or Property list)
- CRUD for templates
- "Apply to properties" bulk action
- Mark one as default

### Phase 3: Dashboard Indicators
- Low-stock badge on property cards in `PropertyListPage`
- "Needs Restock" filter on property list
- Inventory summary on `DashboardPage`

---

## 7. Safe Rollout Plan

| Phase | What | Risk | Rollback |
|---|---|---|---|
| **Phase A** | Schema additions only (additive fields + new table) | Zero — all optional fields | Remove fields |
| **Phase B** | Owner UI: template CRUD + property inventory tab | Low — owner-only, no job impact | Hide UI |
| **Phase C** | Job integration: snapshot on start, cleaner checklist | Medium — touches job flow | Feature flag / skip if no inventory |
| **Phase D** | Cleaner UI: inventory section on cleaning form | Low — additive section | Hide section |
| **Phase E** | Writeback: update property currentQty from job | Low — optional enrichment | Disable writeback |

---

## 8. Implementation Batches

### Batch 1: Schema + Backend Foundation
**Files touched:**
- `convex/schema.ts` — add `inventoryTemplates` table, add `inventoryItems`/`inventoryTemplateId` to properties, add `inventoryChecklist` to jobs
- `convex/mutations/inventoryTemplates.ts` — new: CRUD for templates
- `convex/queries/inventoryTemplates.ts` — new: list/get templates
- `convex/mutations/properties.ts` — extend update to handle inventoryItems
- `convex/lib/constants.ts` — add `INVENTORY_CATEGORIES` and optional `DEFAULT_INVENTORY_TEMPLATE`

**Estimated scope:** ~200 lines new code

### Batch 2: Owner Template UI
**Files touched:**
- `packages/frontend/src/pages/owner/InventoryTemplatesPage.tsx` — new page
- `packages/frontend/src/App.tsx` — add route
- Navigation component — add link

**Estimated scope:** ~300 lines new code

### Batch 3: Property Inventory Tab
**Files touched:**
- `packages/frontend/src/pages/owner/PropertyDetailPage.tsx` — add Inventory tab
- `packages/frontend/src/pages/owner/PropertyFormPage.tsx` — optional: inventory section on create/edit
- `packages/frontend/src/components/InventoryItemRow.tsx` — new: reusable row component

**Estimated scope:** ~250 lines new code

### Batch 4: Job Snapshot + Cleaner Checklist
**Files touched:**
- `convex/mutations/jobs.ts` — extend `startJob` to snapshot inventory
- `convex/mutations/forms.ts` — extend completion to write back qty
- `packages/frontend/src/pages/cleaner/CleaningFormPage.tsx` — add inventory section
- `packages/frontend/src/pages/cleaner/CleanerJobDetailPage.tsx` — show inventory checklist

**Estimated scope:** ~200 lines new code

### Batch 5: Owner Review + Dashboard
**Files touched:**
- `packages/frontend/src/pages/owner/JobDetailPage.tsx` — show inventory report in review
- `packages/frontend/src/pages/owner/PropertyListPage.tsx` — low-stock indicators
- `packages/frontend/src/pages/owner/DashboardPage.tsx` — inventory summary widget

**Estimated scope:** ~150 lines new code

---

## Category Presets

```typescript
export const INVENTORY_CATEGORIES = [
  "bathroom",
  "kitchen",
  "bedroom",
  "general",
  "outdoor",
] as const;

export const DEFAULT_INVENTORY_ITEMS = [
  { name: "Toilet Paper", category: "bathroom", parLevel: 4, required: true },
  { name: "Hand Soap", category: "bathroom", parLevel: 2, required: true },
  { name: "Shampoo", category: "bathroom", parLevel: 2, required: true },
  { name: "Conditioner", category: "bathroom", parLevel: 2, required: true },
  { name: "Body Wash", category: "bathroom", parLevel: 2, required: true },
  { name: "Paper Towels", category: "kitchen", parLevel: 2, required: true },
  { name: "Dish Soap", category: "kitchen", parLevel: 1, required: true },
  { name: "Dishwasher Pods", category: "kitchen", parLevel: 6, required: false },
  { name: "Trash Bags", category: "kitchen", parLevel: 4, required: true },
  { name: "Sponge", category: "kitchen", parLevel: 1, required: true },
  { name: "Coffee", category: "kitchen", parLevel: 1, required: false },
  { name: "Coffee Filters", category: "kitchen", parLevel: 4, required: false },
  { name: "Sugar", category: "kitchen", parLevel: 1, required: false },
  { name: "Creamer", category: "kitchen", parLevel: 1, required: false },
  { name: "Laundry Detergent", category: "general", parLevel: 1, required: false },
  { name: "Dryer Sheets", category: "general", parLevel: 4, required: false },
  { name: "Wine (Welcome Gift)", category: "general", parLevel: 1, required: false },
  { name: "Snack Basket", category: "general", parLevel: 1, required: false },
];
```

---

## Key Design Decisions Summary

| Decision | Choice | Rationale |
|---|---|---|
| Storage model | Template table + embedded array on property | Balance of simplicity and reuse |
| Job integration | Snapshot on job start | Matches existing `propertySnapshot` pattern, historical record |
| Cleaner role | Report status, not edit par levels | Cleaners observe and report; owners manage targets |
| Template scope | Per-company only (MVP) | Avoid multi-tenant template complexity |
| Writeback | Optional, on job completion | Keeps property data fresh without real-time mutation conflicts |
| Categories | Fixed enum for MVP | Simple grouping, expandable later |
| Quantities | Integer only, no units | "4 rolls" is understood contextually; units add UI complexity |

---

## What This Does NOT Include (Future Sprints)

- Auto-reorder / purchase integration
- Vendor management
- Cost tracking / budget per property
- Barcode scanning
- Photo verification of inventory
- Global SCRUB-provided templates
- Template sync (push changes to linked properties)
- Inventory analytics / consumption trends
- Low-stock notifications (push/email)
