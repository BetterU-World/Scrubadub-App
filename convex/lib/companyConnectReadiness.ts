import { invoicePaymentsEnabled } from "./environment";
export type CompanyConnectState = "set_up" | "reconnect_required" | "payments_paused" | "checking" | "continue_verification" | "action_needed" | "ready";

export type CompanyConnectSnapshot = {
  stripeConnectAccountId?: string | null;
  stripeConnectArchitecture?: "merchant_direct_v2";
  stripeConnectModernReady?: boolean;
  stripeConnectPendingAccountId?: string;
  stripeConnectChargesEnabled?: boolean;
  stripeConnectPayoutsEnabled?: boolean;
  stripeConnectDetailsSubmitted?: boolean;
  stripeConnectRequirementsDue?: boolean;
  stripeConnectDisabledReason?: string;
  stripeConnectLastSyncAt?: number;
};

export const CONNECT_STATUS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function canAcceptClientInvoicePayments(value: CompanyConnectSnapshot): boolean {
  return invoicePaymentsEnabled()
    && value.stripeConnectArchitecture === "merchant_direct_v2"
    && value.stripeConnectModernReady === true
    && !!value.stripeConnectAccountId
    && !!value.stripeConnectLastSyncAt && Date.now() - value.stripeConnectLastSyncAt <= CONNECT_STATUS_MAX_AGE_MS
    && value.stripeConnectChargesEnabled === true && value.stripeConnectPayoutsEnabled === true
    && !value.stripeConnectRequirementsDue && !value.stripeConnectDisabledReason;
}

export function liveInvoiceCheckoutReady(account: { id: string; charges_enabled: boolean; payouts_enabled: boolean; requirements?: { currently_due?: string[] | null; past_due?: string[] | null; disabled_reason?: string | null } | null }, expectedAccountId: string) {
  const snapshot = snapshotFromStripeAccount(account);
  return account.id === expectedAccountId && !!account.requirements && Array.isArray(account.requirements.currently_due) && Array.isArray(account.requirements.past_due) && snapshot.chargesEnabled && snapshot.payoutsEnabled && !snapshot.requirementsDue && !snapshot.disabledReason;
}

export function companyConnectState(value: CompanyConnectSnapshot, now = Date.now()): CompanyConnectState {
  if (value.stripeConnectPendingAccountId) return "continue_verification";
  if (!value.stripeConnectAccountId) return "set_up";
  if (value.stripeConnectArchitecture !== "merchant_direct_v2") return "reconnect_required";
  if (!value.stripeConnectLastSyncAt || now - value.stripeConnectLastSyncAt > CONNECT_STATUS_MAX_AGE_MS) return "checking";
  if (value.stripeConnectModernReady && !invoicePaymentsEnabled()) return "payments_paused";
  if (canAcceptClientInvoicePayments(value)) return "ready";
  if (value.stripeConnectRequirementsDue || value.stripeConnectDisabledReason) return "action_needed";
  return "continue_verification";
}

export type MerchantAccountFacts = {
  id: string; closed?: boolean; livemode: boolean; dashboard?: string; applied_configurations: string[];
  configuration?: { merchant?: { capabilities?: { card_payments?: { status: string; status_details?: unknown[] }; stripe_balance?: { payouts?: { status: string; status_details?: unknown[] } } } } };
  defaults?: { currency?: string; responsibilities?: { fees_collector?: string; losses_collector?: string } };
  identity?: { country?: string };
  requirements?: { entries?: unknown[]; summary?: { minimum_deadline?: { status: string } } };
};

/** Both representations are retrieved live; omitted include-dependent facts fail closed. */
export function liveMerchantInvoiceCheckoutReady(account: MerchantAccountFacts, compatible: Parameters<typeof liveInvoiceCheckoutReady>[0], expectedId: string, expectedLivemode: boolean): boolean {
  const merchant = account.configuration?.merchant;
  const card = merchant?.capabilities?.card_payments;
  const payouts = merchant?.capabilities?.stripe_balance?.payouts;
  const deadline = account.requirements?.summary?.minimum_deadline?.status;
  const entries = account.requirements?.entries;
  const requirementsKnown = Array.isArray(entries) && (entries.length === 0 || deadline === "eventually_due");
  return account.id === expectedId && account.closed === false
    && account.livemode === expectedLivemode
    && account.applied_configurations.includes("merchant") && !!merchant
    && account.dashboard === "express"
    && account.identity?.country?.toLowerCase() === "us" && account.defaults?.currency === "usd"
    && account.defaults?.responsibilities?.fees_collector === "stripe"
    && account.defaults?.responsibilities?.losses_collector === "stripe"
    && card?.status === "active" && card.status_details?.length === 0
    && payouts?.status === "active" && payouts.status_details?.length === 0
    && requirementsKnown && !["currently_due", "past_due"].includes(deadline ?? "")
    && liveInvoiceCheckoutReady(compatible, expectedId);
}

export function snapshotFromStripeAccount(account: {
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted?: boolean;
  requirements?: { currently_due?: string[] | null; past_due?: string[] | null; disabled_reason?: string | null } | null;
}) {
  return {
    chargesEnabled: account.charges_enabled === true,
    payoutsEnabled: account.payouts_enabled === true,
    detailsSubmitted: account.details_submitted === true,
    requirementsDue: !!(account.requirements?.currently_due?.length || account.requirements?.past_due?.length),
    disabledReason: account.requirements?.disabled_reason ?? undefined,
  };
}
