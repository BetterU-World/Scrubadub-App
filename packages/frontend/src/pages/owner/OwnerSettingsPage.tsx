import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import {
  Building2,
  Bell,
  ChevronRight,
  CheckCircle,
  Link2,
  ExternalLink,
  Banknote,
  Globe,
  Archive,
} from "lucide-react";
import { BillingSection } from "@/components/settings/BillingSection";

export function OwnerSettingsPage() {
  const { t } = useTranslation();
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
      <PageHeader title={t("settings.title")} />
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
                  {t("settings.payoutsConnected")}
                </p>
                <p className="text-sm text-gray-500">
                  {t("settings.payoutsConnectedDesc")}
                </p>
              </div>
            </div>
            <button
              onClick={handleManageStripe}
              disabled={loading !== null}
              className="btn-secondary text-sm flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {loading === "manage" ? t("settings.opening") : t("settings.managePayoutAccount")}
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
                {t("settings.payoutsNotConnected")}
              </p>
              <p className="text-sm text-gray-500">
                {t("settings.payoutsNotConnectedDesc")}
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
            <p className="font-medium text-gray-900">{t("settings.companyProfile")}</p>
            <p className="text-sm text-gray-500">
              {t("settings.companyProfileDesc")}
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
            <p className="font-medium text-gray-900">{t("settings.paymentsLabel")}</p>
            <p className="text-sm text-gray-500">
              {t("settings.paymentsDesc")}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </Link>

        {/* ── Archived Properties ─────────────────────────── */}
        <Link
          href="/owner/settings/archived-properties"
          className="card flex items-center gap-4 hover:bg-gray-50 transition-colors"
        >
          <div className="p-2 rounded-lg bg-primary-50 text-primary-600">
            <Archive className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900">{t("settings.archivedProperties")}</p>
            <p className="text-sm text-gray-500">
              {t("settings.archivedPropertiesDesc")}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </Link>

        {/* ── Disabled items ───────────────────────────────── */}
        <div
          className="card flex items-center gap-4 opacity-50 cursor-not-allowed"
        >
          <div className="p-2 rounded-lg bg-gray-100 text-gray-400">
            <Bell className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-400">{t("settings.notifications")}</p>
            <p className="text-sm text-gray-400">{t("settings.comingSoon")}</p>
          </div>
        </div>

        {/* Language */}
        <div className="card flex items-center gap-4">
          <div className="p-2 rounded-lg bg-primary-50 text-primary-600">
            <Globe className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900">{t("settings.language")}</p>
            <p className="text-sm text-gray-500">{t("settings.languageDesc")}</p>
          </div>
          <LanguageSwitcher />
        </div>
      </div>
    </div>
  );
}
