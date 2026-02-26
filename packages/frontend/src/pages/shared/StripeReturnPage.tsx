import { useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { useLocation } from "wouter";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageLoader } from "@/components/ui/LoadingSpinner";

/**
 * Shared page for both /affiliate/stripe/return and /affiliate/stripe/refresh.
 * Syncs Stripe Connect status then redirects back to the Affiliate portal.
 */
export function StripeReturnPage() {
  const { userId, isLoading } = useAuth();

  if (isLoading) return <PageLoader />;
  if (!userId) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-gray-500">Please sign in to continue.</p>
      </div>
    );
  }

  return <StripeReturnInner userId={userId} />;
}

function StripeReturnInner({ userId }: { userId: import("../../../../../convex/_generated/dataModel").Id<"users"> }) {
  const syncStatus = useAction(api.actions.stripeConnect.syncMyStripeConnectStatus);
  const [, navigate] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    syncStatus({ userId })
      .then(() => navigate("/affiliate"))
      .catch((err) => {
        console.error("Stripe sync failed:", err);
        setError("Failed to sync your Stripe status. Redirecting...");
        setTimeout(() => navigate("/affiliate"), 3000);
      });
  }, [userId, syncStatus, navigate]);

  if (error) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-red-600 mb-2">{error}</p>
      </div>
    );
  }

  return (
    <div className="py-16 text-center">
      <PageLoader />
      <p className="text-sm text-gray-500 mt-4">
        Syncing your Stripe status...
      </p>
    </div>
  );
}
