import { useState, type ComponentType } from "react";
import { Link } from "wouter";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import {
  Archive,
  Banknote,
  Bell,
  Building2,
  CheckCircle,
  ChevronRight,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Globe,
  Link2,
  Users,
} from "lucide-react";
import { BillingSection } from "@/components/settings/BillingSection";

function SettingsLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="card flex items-center gap-4 transition-colors hover:bg-gray-50">
      <div className="rounded-lg bg-primary-50 p-2 text-primary-600">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-gray-900">{title}</p>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-gray-400" aria-hidden="true" />
    </Link>
  );
}

function SectionHeading({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
      {children}
    </h2>
  );
}

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
      <PageHeader title={t("settings.title")} description={t("settings.description")} />
      <div className="max-w-lg space-y-8">
        <section aria-labelledby="settings-company-heading">
          <SectionHeading id="settings-company-heading">{t("settings.groups.company")}</SectionHeading>
          <SettingsLink
            href="/owner/settings/company"
            icon={Building2}
            title={t("settings.companyProfile")}
            description={t("settings.companyProfileDesc")}
          />
        </section>

        <section aria-labelledby="settings-team-heading">
          <SectionHeading id="settings-team-heading">{t("settings.groups.teamDocuments")}</SectionHeading>
          <div className="space-y-2">
            <SettingsLink href="/owner/settings/documents" icon={FileText} title={t("settings.documentsHub")} description={t("settings.documentsHubDesc")} />
            <SettingsLink href="/owner/settings/onboarding" icon={ClipboardCheck} title={t("settings.workerDocuments")} description={t("settings.workerDocumentsDesc")} />
            <SettingsLink href="/employees" icon={Users} title={t("settings.workersAccess")} description={t("settings.workersAccessDesc")} />
          </div>
        </section>

        <section aria-labelledby="settings-billing-heading">
          <SectionHeading id="settings-billing-heading">{t("settings.groups.billingPayments")}</SectionHeading>
          <p className="mb-3 -mt-2 text-sm text-gray-500">{t("settings.billingPaymentsDesc")}</p>
          <div className="space-y-2">
            <BillingSection />
            {isConnected ? (
              <div className="card">
                <div className="mb-3 flex items-center gap-3">
                  <div className="rounded-lg bg-green-100 p-2 text-green-600">
                    <CheckCircle className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900">{t("settings.customerPaymentsConnected")}</p>
                    <p className="text-sm text-gray-500">{t("settings.payoutsConnectedDesc")}</p>
                  </div>
                </div>
                <button onClick={handleManageStripe} disabled={loading !== null} className="btn-secondary flex items-center gap-1.5 text-sm">
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  {loading === "manage" ? t("settings.opening") : t("settings.managePayoutAccount")}
                </button>
              </div>
            ) : (
              <SettingsLink
                href="/owner/settings/billing"
                icon={Link2}
                title={t("settings.customerPayments")}
                description={t("settings.payoutsNotConnectedDesc")}
              />
            )}
            <SettingsLink href="/owner/payments" icon={Banknote} title={t("settings.paymentsLabel")} description={t("settings.paymentsDesc")} />
          </div>
        </section>

        <section aria-labelledby="settings-preferences-heading">
          <SectionHeading id="settings-preferences-heading">{t("settings.groups.preferencesData")}</SectionHeading>
          <div className="space-y-2">
            <SettingsLink
              href="/owner/settings/archived-properties"
              icon={Archive}
              title={t("settings.archivedProperties")}
              description={t("settings.archivedPropertiesDesc")}
            />
            <div className="card flex items-center gap-4 border-dashed bg-gray-50 opacity-60" aria-disabled="true">
              <div className="rounded-lg bg-gray-100 p-2 text-gray-400"><Bell className="h-5 w-5" aria-hidden="true" /></div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-500">{t("settings.notifications")}</p>
                <p className="text-sm text-gray-400">{t("settings.comingSoon")}</p>
              </div>
            </div>
            <div className="card flex items-center gap-4">
              <div className="rounded-lg bg-primary-50 p-2 text-primary-600"><Globe className="h-5 w-5" aria-hidden="true" /></div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900">{t("settings.language")}</p>
                <p className="text-sm text-gray-500">{t("settings.languageDesc")}</p>
              </div>
              <LanguageSwitcher />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
