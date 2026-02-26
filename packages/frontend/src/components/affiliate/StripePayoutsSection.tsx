import { useState, useEffect, useRef } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { CheckCircle, AlertCircle, ExternalLink, RefreshCw } from "lucide-react";

export function StripePayoutsSection() {
  const { user, userId, isLoading } = useAuth();

  if (isLoading) return <PageLoader />;
  if (!userId || !user) return null;

  return <StripePayoutsInner userId={userId} />;
}

function StripePayoutsInner({ userId }: { userId: Id<"users"> }) {
  const status = useQuery(api.queries.stripeConnect.getMyStripeConnectStatus, {
    userId,
  });
  const isStripeConfigured = useAction(api.actions.stripeConnect.isStripeConfigured);
  const startOnboarding = useAction(api.actions.stripeConnect.startStripeConnectOnboarding);
  const syncStatus = useAction(api.actions.stripeConnect.syncMyStripeConnectStatus);

  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkedRef = useRef(false);

  // Check if Stripe is configured on mount
  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    isStripeConfigured({})
      .then(setConfigured)
      .catch(() => setConfigured(false));
  }, [isStripeConfigured]);

  if (status === undefined || configured === null) return <PageLoader />;

  async function handleStartOnboarding() {
    setLoading(true);
    setError(null);
    try {
      const result = await startOnboarding({
        userId,
        returnTo: window.location.origin,
      });
      if (result.ok) {
        window.location.href = result.url!;
      } else {
        if (result.reason === "not_configured") {
          setConfigured(false);
        } else {
          setError(result.reason ?? "Something went wrong");
        }
      }
    } catch (err: any) {
      setError(err.message ?? "Failed to start onboarding");
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setError(null);
    try {
      const result = await syncStatus({ userId });
      if (!result.ok) {
        setError(result.reason ?? "Sync failed");
      }
    } catch (err: any) {
      setError(err.message ?? "Failed to sync status");
    } finally {
      setSyncing(false);
    }
  }

  // -- Not configured --
  if (!configured) {
    return (
      <div className="bg-white rounded-lg shadow p-6 max-w-xl">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Stripe Payouts
        </h2>
        <div className="bg-yellow-50 border border-yellow-200 rounded-md px-4 py-3 mb-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-yellow-800">
              Stripe payouts not configured yet. Contact your administrator to
              set up Stripe Connect.
            </p>
          </div>
        </div>
        <button
          disabled
          className="px-4 py-2 bg-gray-200 text-gray-400 text-sm font-medium rounded-md cursor-not-allowed"
        >
          Start Stripe Onboarding
        </button>
      </div>
    );
  }

  const onboardingStatus = status.onboardingStatus;
  const hasAccount = !!status.stripeConnectAccountId;

  // -- Complete --
  if (onboardingStatus === "complete") {
    return (
      <div className="bg-white rounded-lg shadow p-6 max-w-xl">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Stripe Payouts
        </h2>
        <div className="bg-green-50 border border-green-200 rounded-md px-4 py-3 mb-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-800 font-medium">
              Stripe connected
            </p>
          </div>
        </div>

        <StatusDetails status={status} />

        <button
          onClick={handleSync}
          disabled={syncing}
          className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync status"}
        </button>

        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}
      </div>
    );
  }

  // -- In progress --
  if (onboardingStatus === "in_progress" && hasAccount) {
    return (
      <div className="bg-white rounded-lg shadow p-6 max-w-xl">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Stripe Payouts
        </h2>
        <div className="bg-blue-50 border border-blue-200 rounded-md px-4 py-3 mb-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-blue-800">
              Stripe onboarding is in progress. Complete the remaining steps to
              enable payouts.
            </p>
          </div>
        </div>

        <StatusDetails status={status} />

        <div className="flex flex-wrap gap-3 mt-4">
          <button
            onClick={handleStartOnboarding}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <ExternalLink className="h-4 w-4" />
            {loading ? "Loading..." : "Continue Stripe Onboarding"}
          </button>

          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync status"}
          </button>
        </div>

        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}
      </div>
    );
  }

  // -- Not started (default) --
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
        onClick={handleStartOnboarding}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
      >
        <ExternalLink className="h-4 w-4" />
        {loading ? "Loading..." : "Start Stripe Onboarding"}
      </button>

      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}

function StatusDetails({
  status,
}: {
  status: {
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    requirementsDue: string | null;
    lastSyncAt: number | null;
  };
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
      <dt className="text-gray-500">Payouts enabled</dt>
      <dd className="text-gray-900 font-medium">
        {status.payoutsEnabled ? "Yes" : "No"}
      </dd>
      <dt className="text-gray-500">Details submitted</dt>
      <dd className="text-gray-900 font-medium">
        {status.detailsSubmitted ? "Yes" : "No"}
      </dd>
      {status.requirementsDue && (
        <>
          <dt className="text-gray-500">Requirements due</dt>
          <dd className="text-gray-900 text-xs break-all">
            {status.requirementsDue}
          </dd>
        </>
      )}
      {status.lastSyncAt && (
        <>
          <dt className="text-gray-500">Last synced</dt>
          <dd className="text-gray-900">
            {new Date(status.lastSyncAt).toLocaleString()}
          </dd>
        </>
      )}
    </dl>
  );
}
