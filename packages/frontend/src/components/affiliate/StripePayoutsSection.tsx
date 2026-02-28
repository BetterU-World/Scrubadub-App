import { useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { CheckCircle, ExternalLink, Settings } from "lucide-react";

export function StripePayoutsSection() {
  const { user, userId, isLoading } = useAuth();

  if (isLoading) return <PageLoader />;
  if (!userId || !user) return null;

  return <StripePayoutsInner userId={userId} />;
}

function StripePayoutsInner({ userId }: { userId: Id<"users"> }) {
  const status = useQuery(api.queries.stripeConnect.getAffiliateConnectStatus, {
    userId,
  });
  const createAccountLink = useAction(
    api.actions.affiliateStripeConnect.createAffiliateStripeAccountLink
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === undefined) return <PageLoader />;

  const isConnected = !!status.affiliateStripeAccountId;
  const accountIdSuffix = status.affiliateStripeAccountId
    ? status.affiliateStripeAccountId.slice(-6)
    : null;

  async function handleConnect() {
    setLoading(true);
    setError(null);
    try {
      const result = await createAccountLink({ userId });
      if (result?.url) {
        window.location.href = result.url;
      }
    } catch (err: any) {
      setError(err.message ?? "Failed to start onboarding");
    } finally {
      setLoading(false);
    }
  }

  if (isConnected) {
    return (
      <div className="bg-white rounded-lg shadow p-6 max-w-xl">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Stripe Payouts
        </h2>
        <div className="bg-green-50 border border-green-200 rounded-md px-4 py-3 mb-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
            <div>
              <p className="text-sm text-green-800 font-medium">
                Stripe Connected
              </p>
              <p className="text-xs text-green-700">
                ...{accountIdSuffix}
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleConnect}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          <Settings className="h-4 w-4" />
          {loading ? "Redirecting..." : "Update Stripe details"}
        </button>

        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6 max-w-xl">
      <h2 className="text-lg font-semibold text-gray-900 mb-3">
        Stripe Payouts
      </h2>
      <p className="text-sm text-gray-600 mb-4">
        Connect your Stripe account to receive affiliate payouts directly to
        your bank account.
      </p>

      <button
        onClick={handleConnect}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
      >
        <ExternalLink className="h-4 w-4" />
        {loading ? "Redirecting..." : "Connect Stripe for Affiliate Payouts"}
      </button>

      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
