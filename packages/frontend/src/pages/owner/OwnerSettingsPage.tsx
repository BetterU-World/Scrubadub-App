import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  Building2,
  Bell,
  ChevronRight,
  CheckCircle,
  Link2,
  ExternalLink,
  Banknote,
} from "lucide-react";
import { BillingSection } from "@/components/settings/BillingSection";

/* ── Disabled "coming soon" items ────────────────────────────── */
const disabledItems = [
  { label: "Notifications", description: "Coming soon", icon: Bell },
];

export function OwnerSettingsPage() {
  const { user } = useAuth();

  const connectStatus = useQuery(
    api.queries.companyStripeConnect.getCompanyConnectStatus,
    user?._id ? { userId: user._id } : "skip",
  );

  const createAccountLink = useAction(
    api.actions.companyStripeConnect.createCompanyStripeAccountLink,
  );

  const [loading, setLoading] = useState<string | null>(null);

  const isConnected = !!connectStatus?.stripeConnectAccountId;

  const handleManageStripe = async () => {
    if (!user) return;
    setLoading("manage");
    try {
      const result = await createAccountLink({ userId: user._id });
      if (result?.url) window.location.href = result.url;
    } catch {
      window.location.href = "/owner/settings/billing";
    } finally {
      setLoading(null);
    }
  };

  return (
    <div>
      <PageHeader title="Settings" />
      <div className="max-w-lg space-y-2">
        {/* ── Billing & Subscription (paying for Scrubadub) ──── */}
        <BillingSection />

        {/* ── Stripe Connect / Payouts (receiving money) ─────── */}
        {isConnected ? (
          <div className="card">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-green-100 text-green-600">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900">
                  Payouts &mdash; Connected
                </p>
                <p className="text-sm text-gray-500">
                  Your Stripe account receives payments from customers.
                </p>
              </div>
            </div>
            <button
              onClick={handleManageStripe}
              disabled={loading !== null}
              className="btn-secondary text-sm flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {loading === "manage" ? "Opening…" : "Manage Payout Account"}
            </button>
          </div>
        ) : (
          <Link
            href="/owner/settings/billing"
            className="card flex items-center gap-4 hover:bg-gray-50 transition-colors"
          >
            <div className="p-2 rounded-lg bg-primary-50 text-primary-600">
              <Link2 className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900">
                Payouts &mdash; Not connected
              </p>
              <p className="text-sm text-gray-500">
                Connect Stripe to start receiving payments from customers.
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </Link>
        )}

        {/* ── Company Profile card ──────────────────────────── */}
        <Link
          href="/owner/settings/company"
          className="card flex items-center gap-4 hover:bg-gray-50 transition-colors"
        >
          <div className="p-2 rounded-lg bg-primary-50 text-primary-600">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900">Company Profile</p>
            <p className="text-sm text-gray-500">
              Contact info and defaults for your microsites.
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </Link>

        {/* ── Payments card ──────────────────────────────── */}
        <Link
          href="/owner/payments"
          className="card flex items-center gap-4 hover:bg-gray-50 transition-colors"
        >
          <div className="p-2 rounded-lg bg-primary-50 text-primary-600">
            <Banknote className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900">Payments</p>
            <p className="text-sm text-gray-500">
              Partner settlements and cleaner payments.
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </Link>

        {/* ── Disabled items ───────────────────────────────── */}
        {disabledItems.map((item) => (
          <div
            key={item.label}
            className="card flex items-center gap-4 opacity-50 cursor-not-allowed"
          >
            <div className="p-2 rounded-lg bg-gray-100 text-gray-400">
              <item.icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-400">{item.label}</p>
              <p className="text-sm text-gray-400">{item.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
