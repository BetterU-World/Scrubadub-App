import { useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { Link2, CheckCircle, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

export function CleanerSettingsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const connectStatus = useQuery(
    api.queries.cleanerStripeConnect.getCleanerConnectStatus,
    user?._id ? { userId: user._id } : "skip"
  );
  const createAccountLink = useAction(
    api.actions.cleanerStripeConnect.createCleanerStripeAccountLink
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read query params for feedback
  const params = new URLSearchParams(window.location.search);
  const stripeParam = params.get("stripe");

  if (!user || connectStatus === undefined) return <PageLoader />;

  const isConnected = !!connectStatus?.stripeConnectAccountId;
  const accountIdSuffix = connectStatus?.stripeConnectAccountId
    ? connectStatus.stripeConnectAccountId.slice(-6)
    : null;

  const handleConnect = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await createAccountLink({ userId: user._id });
      if (result?.url) {
        window.location.href = result.url;
      }
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader title={t("cleanerSettings.title")} />

      {/* Feedback banners */}
      {stripeParam === "return" && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 text-green-700 text-sm flex items-center gap-2">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          {t("cleanerSettings.onboardingComplete")}
        </div>
      )}
      {stripeParam === "refresh" && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-50 text-yellow-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {t("cleanerSettings.sessionExpired")}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Stripe Connect card */}
      <div className="card max-w-md">
        <h3 className="font-semibold text-gray-900 mb-3">{t("cleanerSettings.getPaid")}</h3>
        {isConnected ? (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-green-100 text-green-600">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">{t("cleanerSettings.stripeConnected")}</p>
                <p className="text-sm text-gray-500">...{accountIdSuffix}</p>
              </div>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              {t("cleanerSettings.stripeConnectedDesc")}
            </p>
            <button
              onClick={handleConnect}
              disabled={loading}
              className="btn-secondary w-full flex items-center justify-center gap-2"
            >
              <Link2 className="w-4 h-4" />
              {loading ? t("cleanerSettings.redirecting") : t("cleanerSettings.updateStripeInfo")}
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-gray-100 text-gray-500">
                <Link2 className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">{t("cleanerSettings.connectStripe")}</p>
                <p className="text-sm text-gray-500">
                  {t("cleanerSettings.connectStripeDesc")}
                </p>
              </div>
            </div>
            <button
              onClick={handleConnect}
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <Link2 className="w-4 h-4" />
              {loading ? t("cleanerSettings.redirecting") : t("cleanerSettings.connectStripeToPay")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
