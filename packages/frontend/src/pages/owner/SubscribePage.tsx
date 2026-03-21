import { useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { toFriendlyMessage } from "@/lib/friendlyError";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { CreditCard, CheckCircle } from "lucide-react";

type PlanKey = "solo" | "team" | "pro";

const PLANS: Record<PlanKey, { name: string; price: string; cleaners: string }> = {
  solo: { name: "Solo", price: "$34.99", cleaners: "1 cleaner" },
  team: { name: "Team", price: "$64.99", cleaners: "Up to 5 cleaners" },
  pro: { name: "Pro", price: "$149.99", cleaners: "Unlimited cleaners" },
};

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
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>("team");

  if (!user || subscription === undefined) return <PageLoader />;

  const isActive =
    subscription?.subscriptionStatus === "trialing" ||
    subscription?.subscriptionStatus === "active";

  const handleSubscribe = async (plan: PlanKey) => {
    setLoading("checkout");
    try {
      const url = await createCheckout({
        userId: user._id,
        tier: "cleaning_owner",
        plan,
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
              <p className="font-semibold text-gray-900">SCRUB {subscription?.planName ?? "Pro"}</p>
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

  const plan = PLANS[selectedPlan];

  return (
    <div>
      <PageHeader
        title="Subscribe"
        description="Start your 14-day free trial today"
      />
      <div className="max-w-md">
        {/* Plan selector */}
        <div className="flex gap-2 mb-4">
          {(["solo", "team", "pro"] as const).map((key) => (
            <button
              key={key}
              onClick={() => setSelectedPlan(key)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition ${
                selectedPlan === key
                  ? "border-primary-500 bg-primary-50 text-primary-700"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
              }`}
            >
              {PLANS[key].name}
              <span className="block text-xs font-normal mt-0.5">{PLANS[key].price}/mo</span>
            </button>
          ))}
        </div>
        <div className="card flex flex-col">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-primary-100 text-primary-600">
              <CreditCard className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-gray-900">SCRUB {plan.name}</h3>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Full access to SCRUB for your cleaning business.
          </p>
          <p className="text-2xl font-bold text-gray-900 mb-1">
            {plan.price}
            <span className="text-sm font-normal text-gray-500">/mo</span>
          </p>
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
            <CheckCircle className="w-4 h-4 text-primary-500 flex-shrink-0" />
            {plan.cleaners}
          </div>
          <p className="text-xs text-gray-400 mb-4">
            14-day free trial included
          </p>
          <button
            onClick={() => handleSubscribe(selectedPlan)}
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
