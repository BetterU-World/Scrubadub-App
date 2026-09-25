export type CompanyConnectState = "set_up" | "checking" | "continue_verification" | "action_needed" | "ready";

export type CompanyConnectSnapshot = {
  stripeConnectAccountId?: string | null;
  stripeConnectChargesEnabled?: boolean;
  stripeConnectPayoutsEnabled?: boolean;
  stripeConnectDetailsSubmitted?: boolean;
  stripeConnectRequirementsDue?: boolean;
  stripeConnectDisabledReason?: string;
  stripeConnectLastSyncAt?: number;
};

export const CONNECT_STATUS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function canAcceptClientInvoicePayments(value: CompanyConnectSnapshot): boolean {
  return !!value.stripeConnectAccountId && value.stripeConnectChargesEnabled === true && value.stripeConnectPayoutsEnabled === true;
}

export function companyConnectState(value: CompanyConnectSnapshot, now = Date.now()): CompanyConnectState {
  if (!value.stripeConnectAccountId) return "set_up";
  if (!value.stripeConnectLastSyncAt || now - value.stripeConnectLastSyncAt > CONNECT_STATUS_MAX_AGE_MS) return "checking";
  if (canAcceptClientInvoicePayments(value)) return "ready";
  if (value.stripeConnectRequirementsDue || value.stripeConnectDisabledReason) return "action_needed";
  return "continue_verification";
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
