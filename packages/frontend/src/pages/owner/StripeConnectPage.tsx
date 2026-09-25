import { useEffect, useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { getStaffSessionToken, useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { Link2, CreditCard, CheckCircle, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

export function StripeConnectPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const connectStatus = useQuery(
    api.queries.companyStripeConnect.getCompanyConnectStatus,
    user?._id ? { userId: user._id, sessionToken: getStaffSessionToken() } : "skip"
  );
  const createAccountLink = useAction(
    api.actions.companyStripeConnect.createCompanyStripeAccountLink
  );
  const createTestCheckout = useAction(
    api.actions.companyStripeConnect.createCompanyStripeTestCheckout
  );
  const refreshStatus = useAction(api.actions.companyStripeConnect.refreshCompanyStripeConnectStatus);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [refreshFailed, setRefreshFailed] = useState(false);

  // Read query params for feedback
  const params = new URLSearchParams(window.location.search);
  const stripeParam = params.get("stripe");
  const checkoutParam = params.get("checkout");

  useEffect(() => {
    if (!user?._id) return;
    let active = true;
    setChecking(true);
    setRefreshFailed(false);
    refreshStatus({ userId: user._id, sessionToken: getStaffSessionToken() })
      .catch((e: Error) => { if (active) { setError(e.message); setRefreshFailed(true); } })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [user?._id, refreshStatus]);

  if (!user || connectStatus === undefined) return <PageLoader />;

  const state = checking || refreshFailed ? "checking" : connectStatus?.state ?? "checking";
  const accountIdSuffix = connectStatus?.stripeConnectAccountId
    ? connectStatus.stripeConnectAccountId.slice(-6)
    : null;

  const handleConnectStripe = async () => {
    setLoading("connect");
    setError(null);
    try {
      const result = await createAccountLink({ userId: user._id, sessionToken: getStaffSessionToken() });
      if (result?.url) {
        window.location.href = result.url;
      }
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setLoading(null);
    }
  };

  const handleTestCheckout = async () => {
    setLoading("test");
    setError(null);
    try {
      const result = await createTestCheckout({ userId: user._id, sessionToken: getStaffSessionToken() });
      if (result?.url) {
        window.location.href = result.url;
      }
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div>
      <PageHeader
        title={t("companyConnect.title")}
        description={t("companyConnect.intro")}
        back={{ href: "/owner/settings", label: t("navigation.backToSettings") }}
      />

      {/* Feedback banners */}
      {stripeParam === "return" && checking && (
        <div className="mb-4 p-3 rounded-lg bg-blue-50 text-blue-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {t("companyConnect.returnChecking")}
        </div>
      )}
      {stripeParam === "refresh" && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-50 text-yellow-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {t("companyConnect.expired")}
        </div>
      )}
      {checkoutParam === "success" && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 text-green-700 text-sm flex items-center gap-2">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          {t("companyConnect.testReturned")}
        </div>
      )}
      {checkoutParam === "cancel" && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-50 text-yellow-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {t("companyConnect.testCancelled")}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="card max-w-md">
        {state !== "set_up" ? (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-2 rounded-lg ${state === "ready" ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-700"}`}>
                {state === "ready" ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              </div>
              <div>
                <p className="font-semibold text-gray-900">
                  {t(`companyConnect.states.${state}`)}
                </p>
                <p className="text-sm text-gray-500">
                  {t(`companyConnect.descriptions.${state}`)} {accountIdSuffix && `· ${t("companyConnect.account")} ...${accountIdSuffix}`}
                </p>
              </div>
            </div>
            <button onClick={handleConnectStripe} disabled={loading !== null} className="btn-primary mb-2 w-full">
              {loading === "connect" ? t("companyConnect.opening") : state === "ready" ? t("companyConnect.manage") : t("companyConnect.continue")}
            </button>
            <button
              onClick={handleTestCheckout}
              disabled={loading !== null || state !== "ready"}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <CreditCard className="w-4 h-4" />
              {loading === "test" ? t("companyConnect.opening") : t("companyConnect.testButton")}
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-gray-100 text-gray-500">
                <Link2 className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">
                  {t("companyConnect.states.set_up")}
                </p>
                <p className="text-sm text-gray-500">
                  {t("companyConnect.intro")}
                </p>
              </div>
            </div>
            <button
              onClick={handleConnectStripe}
              disabled={loading !== null}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <Link2 className="w-4 h-4" />
              {loading === "connect" ? t("companyConnect.opening") : t("companyConnect.states.set_up")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
