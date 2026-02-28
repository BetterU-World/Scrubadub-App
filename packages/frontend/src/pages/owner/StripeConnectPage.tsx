import { useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { Link2, CreditCard, CheckCircle, AlertCircle } from "lucide-react";

export function StripeConnectPage() {
  const { user } = useAuth();
  const connectStatus = useQuery(
    api.queries.companyStripeConnect.getCompanyConnectStatus,
    user?._id ? { userId: user._id } : "skip"
  );
  const createAccountLink = useAction(
    api.actions.companyStripeConnect.createCompanyStripeAccountLink
  );
  const createTestCheckout = useAction(
    api.actions.companyStripeConnect.createCompanyStripeTestCheckout
  );
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Read query params for feedback
  const params = new URLSearchParams(window.location.search);
  const stripeParam = params.get("stripe");
  const checkoutParam = params.get("checkout");

  if (!user || connectStatus === undefined) return <PageLoader />;

  const isConnected = !!connectStatus?.stripeConnectAccountId;
  const accountIdSuffix = connectStatus?.stripeConnectAccountId
    ? connectStatus.stripeConnectAccountId.slice(-6)
    : null;

  const handleConnectStripe = async () => {
    setLoading("connect");
    setError(null);
    try {
      const result = await createAccountLink({ userId: user._id });
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
      const result = await createTestCheckout({ userId: user._id });
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
        title="Stripe Connect"
        description="Connect your Stripe account to receive payments"
      />

      {/* Feedback banners */}
      {stripeParam === "return" && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 text-green-700 text-sm flex items-center gap-2">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          Stripe onboarding complete! Your account is now connected.
        </div>
      )}
      {stripeParam === "refresh" && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-50 text-yellow-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          Stripe session expired. Please try connecting again.
        </div>
      )}
      {checkoutParam === "success" && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 text-green-700 text-sm flex items-center gap-2">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          Test checkout completed successfully!
        </div>
      )}
      {checkoutParam === "cancel" && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-50 text-yellow-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          Test checkout was cancelled.
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="card max-w-md">
        {isConnected ? (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-green-100 text-green-600">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">
                  Stripe Connected
                </p>
                <p className="text-sm text-gray-500">
                  ...{accountIdSuffix}
                </p>
              </div>
            </div>
            <button
              onClick={handleTestCheckout}
              disabled={loading !== null}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <CreditCard className="w-4 h-4" />
              {loading === "test" ? "Redirecting..." : "Run $1 Test"}
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
                  Connect Stripe
                </p>
                <p className="text-sm text-gray-500">
                  Set up your Express account to receive payments
                </p>
              </div>
            </div>
            <button
              onClick={handleConnectStripe}
              disabled={loading !== null}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <Link2 className="w-4 h-4" />
              {loading === "connect" ? "Redirecting..." : "Connect Stripe"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
