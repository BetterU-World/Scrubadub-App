import { useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { toFriendlyMessage } from "@/lib/friendlyError";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { CreditCard } from "lucide-react";

export function SubscribePage() {
  const { user } = useAuth();
  const subscription = useQuery(
    api.queries.billing.getCompanySubscription,
    user?.companyId ? { companyId: user.companyId, userId: user._id } : "skip"
  );
  const createCheckout = useAction(api.actions.billing.createCheckoutSession);
  const createPortal = useAction(
    api.actions.billing.createBillingPortalSession
  );
  const [loading, setLoading] = useState<string | null>(null);

  if (!user || subscription === undefined) return <PageLoader />;

  const isActive =
    subscription?.subscriptionStatus === "trialing" ||
    subscription?.subscriptionStatus === "active";

  const handleSubscribe = async () => {
    setLoading("checkout");
    try {
      const url = await createCheckout({
        userId: user._id,
        tier: "cleaning_owner",
      });
      if (url) window.location.href = url;
    } catch (e: any) {
      console.error("Checkout error:", e);
      alert(toFriendlyMessage(e, "Payment didn\u2019t go through. You weren\u2019t charged."));
    } finally {
      setLoading(null);
    }
  };

  const handleManageBilling = async () => {
    setLoading("portal");
    try {
      const url = await createPortal({ userId: user._id });
      if (url) window.location.href = url;
    } catch (e: any) {
      alert(e.message ?? "Something went wrong");
    } finally {
      setLoading(null);
    }
  };

  if (isActive) {
    return (
      <div>
        <PageHeader
          title="Subscription"
          description="Manage your billing and subscription"
        />
        <div className="card max-w-md">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-green-100 text-green-600">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Scrubadub Pro</p>
              <p className="text-sm text-gray-500 capitalize">
                Status: {subscription?.subscriptionStatus}
              </p>
            </div>
          </div>
          <button
            onClick={handleManageBilling}
            disabled={loading !== null}
            className="btn-primary w-full"
          >
            {loading === "portal" ? "Redirecting..." : "Manage Billing"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Subscribe"
        description="Start your 14-day free trial today"
      />
      <div className="max-w-md">
        <div className="card flex flex-col">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-primary-100 text-primary-600">
              <CreditCard className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-gray-900">Scrubadub Pro</h3>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Full access to Scrubadub for your cleaning business.
          </p>
          <p className="text-2xl font-bold text-gray-900 mb-1">
            $249
            <span className="text-sm font-normal text-gray-500">/mo</span>
          </p>
          <p className="text-xs text-gray-400 mb-4">
            14-day free trial included
          </p>
          <button
            onClick={handleSubscribe}
            disabled={loading !== null}
            className="btn-primary w-full mt-auto"
          >
            {loading === "checkout" ? "Redirecting..." : "Start Free Trial"}
          </button>
        </div>
      </div>
    </div>
  );
}
