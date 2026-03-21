import { useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import {
  CreditCard,
  ExternalLink,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
} from "lucide-react";
import { Link } from "wouter";

/** Plan name/price are now dynamic from the subscription query. */

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "active":
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case "trialing":
      return <Clock className="w-4 h-4 text-blue-500" />;
    case "past_due":
      return <AlertCircle className="w-4 h-4 text-yellow-500" />;
    case "canceled":
    case "unpaid":
      return <XCircle className="w-4 h-4 text-red-500" />;
    default:
      return <AlertCircle className="w-4 h-4 text-gray-400" />;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "active":
      return "text-green-700 bg-green-50";
    case "trialing":
      return "text-blue-700 bg-blue-50";
    case "past_due":
      return "text-yellow-700 bg-yellow-50";
    case "canceled":
    case "unpaid":
      return "text-red-700 bg-red-50";
    default:
      return "text-gray-700 bg-gray-50";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "active":
      return "Active";
    case "trialing":
      return "Trial";
    case "past_due":
      return "Past Due";
    case "canceled":
      return "Canceled";
    case "unpaid":
      return "Unpaid";
    default:
      return status;
  }
}

export function BillingSection() {
  const { user } = useAuth();
  const subscription = useQuery(
    api.queries.billing.getCompanySubscription,
    user?.companyId ? { companyId: user.companyId, userId: user._id } : "skip",
  );
  const createPortal = useAction(
    api.actions.billing.createBillingPortalSession,
  );

  const [loading, setLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = (message: string, type: "error" | "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  if (!user) return null;

  // Loading skeleton
  if (subscription === undefined) {
    return (
      <div className="card">
        <div className="animate-pulse space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gray-200" />
            <div className="h-5 w-40 bg-gray-200 rounded" />
          </div>
          <div className="h-4 w-32 bg-gray-100 rounded" />
          <div className="h-4 w-48 bg-gray-100 rounded" />
          <div className="h-9 w-36 bg-gray-200 rounded mt-2" />
        </div>
      </div>
    );
  }

  const status = subscription?.subscriptionStatus;
  const isActive = status === "active" || status === "trialing";
  const isCanceledInPeriod =
    status === "active" && subscription?.cancelAtPeriodEnd;

  const handleManageBilling = async () => {
    setLoading("portal");
    try {
      const url = await createPortal({ userId: user._id });
      if (url) window.location.href = url;
    } catch {
      showToast("Unable to open billing portal. Please try again.", "error");
    } finally {
      setLoading(null);
    }
  };

  // ── No subscription at all ──────────────────────────────────
  if (!subscription || !status) {
    return (
      <>
        {toast && <Toast message={toast.message} type={toast.type} />}
        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-gray-100 text-gray-500">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <p className="font-medium text-gray-900">
                Billing &amp; Subscription
              </p>
              <p className="text-sm text-gray-500">
                No subscription on this account
              </p>
            </div>
          </div>
          <Link
            href="/subscribe"
            className="btn-primary text-sm inline-block"
          >
            Activate Subscription
          </Link>
        </div>
      </>
    );
  }

  // ── Has subscription — show details ─────────────────────────
  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} />}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div
            className={`p-2 rounded-lg ${isActive ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-500"}`}
          >
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <p className="font-medium text-gray-900">
              Billing &amp; Subscription
            </p>
          </div>
        </div>

        <div className="space-y-2 mb-4">
          {/* Plan */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Plan</span>
            <span className="font-medium text-gray-900">
              SCRUB {subscription?.planName ?? "Pro"}
              <span className="text-gray-400 font-normal">
                {" "}
                &middot; {subscription?.planPrice ?? "$149.99"}/mo
              </span>
            </span>
          </div>

          {/* Status */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Status</span>
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(status)}`}
            >
              <StatusIcon status={status} />
              {statusLabel(status)}
            </span>
          </div>

          {/* Next billing / access-until date */}
          {subscription.currentPeriodEnd && isActive && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">
                {isCanceledInPeriod ? "Access Until" : "Next Billing Date"}
              </span>
              <span className="font-medium text-gray-900">
                {formatDate(subscription.currentPeriodEnd)}
              </span>
            </div>
          )}

          {/* Cancellation notice */}
          {isCanceledInPeriod && (
            <p className="text-xs text-yellow-600 bg-yellow-50 px-3 py-2 rounded-lg">
              Your subscription is set to cancel at the end of the current
              period. You can resubscribe from the billing portal.
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleManageBilling}
            disabled={loading !== null}
            className="btn-secondary text-sm flex items-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {loading === "portal" ? "Opening…" : "Manage Subscription"}
          </button>
        </div>
      </div>
    </>
  );
}

function Toast({
  message,
  type,
}: {
  message: string;
  type: "success" | "error";
}) {
  return (
    <div
      className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${
        type === "error" ? "bg-red-600" : "bg-green-600"
      }`}
    >
      {message}
    </div>
  );
}
