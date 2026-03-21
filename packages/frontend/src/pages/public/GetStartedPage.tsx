import { useState, FormEvent } from "react";
import { Link } from "wouter";
import { useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { CheckCircle, CreditCard } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type PlanKey = "solo" | "team" | "pro";

const PLANS: Record<PlanKey, { name: string; price: string; features: string[] }> = {
  solo: {
    name: "Solo",
    price: "$34.99",
    features: [
      "1 cleaner included",
      "Unlimited properties",
      "Job scheduling & tracking",
      "Quality checklists & photo proof",
      "14-day free trial included",
    ],
  },
  team: {
    name: "Team",
    price: "$64.99",
    features: [
      "Up to 5 cleaners",
      "Unlimited properties",
      "Team scheduling & job tracking",
      "Quality checklists & photo proof",
      "Red flag alerts & maintenance tracking",
      "14-day free trial included",
    ],
  },
  pro: {
    name: "Pro",
    price: "$149.99",
    features: [
      "Unlimited cleaners",
      "Unlimited properties",
      "Team scheduling & job tracking",
      "Quality checklists & photo proof",
      "Red flag alerts & maintenance tracking",
      "Performance analytics",
      "Cleaner payments & partner settlements",
      "14-day free trial included",
    ],
  },
};

function parsePlanFromURL(): PlanKey {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("plan");
  if (raw === "solo" || raw === "team" || raw === "pro") return raw;
  return "team";
}

export function GetStartedPage() {
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>(parsePlanFromURL);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const createPublicCheckout = useAction(
    api.actions.publicBilling.createPublicCheckoutSession
  );

  const params = new URLSearchParams(window.location.search);
  const canceled = params.get("canceled") === "true";

  const plan = PLANS[selectedPlan];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const url = await createPublicCheckout({ email, plan: selectedPlan });
      if (url) window.location.href = url;
      else throw new Error("Failed to create checkout session");
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/favicon-96x96.png" alt="SCRUB" className="w-7 h-7" />
            <span className="text-xl font-bold text-primary-700">SCRUB</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="btn-secondary px-4 py-1.5 text-sm">
              Sign In
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-md mx-auto px-4 py-16">
        {canceled && (
          <div className="mb-6 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
            Checkout was canceled. No worries — you can try again anytime.
          </div>
        )}

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Get Started with SCRUB
          </h1>
          <p className="text-gray-500 mt-2">
            Start your 14-day free trial. No charge today.
          </p>
        </div>

        {/* Plan selector */}
        <div className="flex gap-2 mb-6">
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
            <h3 className="font-semibold text-gray-900">{plan.name}</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900 mb-1">
            {plan.price}
            <span className="text-sm font-normal text-gray-500">
              /mo
            </span>
          </p>
          <p className="text-xs text-gray-400 mb-4">
            14-day free trial included
          </p>

          <ul className="space-y-2 mb-6">
            {plan.features.map((f) => (
              <li
                key={f}
                className="flex items-start gap-2 text-sm text-gray-600"
              >
                <CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />
                {f}
              </li>
            ))}
          </ul>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                className="input-field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@company.com"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading && <LoadingSpinner size="sm" />}
              Start Free Trial
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-gray-400">
            You'll create your account after checkout.
          </p>
        </div>

        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-primary-600 font-medium hover:text-primary-700"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
