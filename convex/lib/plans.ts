/**
 * Shared plan entitlement logic for SCRUB pricing tiers.
 *
 * Tiers stored on companies.tier:
 *   scrub_solo  — Solo  ($34.99/mo, 1 cleaner)
 *   scrub_team  — Team  ($64.99/mo, up to 5 cleaners)
 *   scrub_pro   — Pro   ($149.99/mo, unlimited cleaners)
 *   cleaning_owner / str_owner — Legacy Pro (unlimited)
 */

export type ScrubPlan = "solo" | "team" | "pro";

/** Resolve any stored tier value to a normalised ScrubPlan. */
export function tierToScrubPlan(tier?: string | null): ScrubPlan {
  switch (tier) {
    case "scrub_solo":
      return "solo";
    case "scrub_team":
      return "team";
    case "scrub_pro":
      return "pro";
    // Legacy tiers → treat as Pro (unlimited)
    case "cleaning_owner":
    case "str_owner":
      return "pro";
    default:
      // No tier yet (pre-subscription) → pro to avoid blocking
      return "pro";
  }
}

/** Human-readable plan name. */
export function planDisplayName(plan: ScrubPlan): string {
  switch (plan) {
    case "solo":
      return "Solo";
    case "team":
      return "Team";
    case "pro":
      return "Pro";
  }
}

/** Monthly price string for display. */
export function planPrice(plan: ScrubPlan): string {
  switch (plan) {
    case "solo":
      return "$34.99";
    case "team":
      return "$64.99";
    case "pro":
      return "$149.99";
  }
}

/**
 * Maximum number of active cleaners allowed.
 * `null` means unlimited.
 */
export function cleanerLimit(plan: ScrubPlan): number | null {
  switch (plan) {
    case "solo":
      return 1;
    case "team":
      return 5;
    case "pro":
      return null;
  }
}

/** Map a checkout plan choice to the corresponding env var name. */
export function planToEnvVar(plan: ScrubPlan): string {
  switch (plan) {
    case "solo":
      return "STRIPE_PRICE_SCRUB_SOLO";
    case "team":
      return "STRIPE_PRICE_SCRUB_TEAM";
    case "pro":
      return "STRIPE_PRICE_SCRUB_PRO";
  }
}

/** Map a checkout plan choice to the internal tier stored on the company. */
export function planToTier(plan: ScrubPlan): string {
  switch (plan) {
    case "solo":
      return "scrub_solo";
    case "team":
      return "scrub_team";
    case "pro":
      return "scrub_pro";
  }
}
