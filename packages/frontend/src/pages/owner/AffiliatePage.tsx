import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { AffiliateRevenueTab } from "@/components/affiliate/AffiliateRevenueTab";
import { AffiliateLedgerTab } from "@/components/affiliate/AffiliateLedgerTab";
import { PayoutRequestsTab } from "@/components/affiliate/PayoutRequestsTab";
import { Copy, ExternalLink, Share2, Users } from "lucide-react";

function getReferralBaseUrl(): string {
  const h = window.location.hostname;
  if (h === "localhost" || h === "127.0.0.1") {
    return `${window.location.protocol}//${window.location.host}/?ref=`;
  }
  return "https://scrubscrubscrub.com/?ref=";
}

type Tab = "referrals" | "revenue" | "ledger" | "requests";

export function AffiliatePage() {
  const { user, userId, isLoading } = useAuth();

  if (isLoading) return <PageLoader />;
  if (!userId || !user) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-gray-500">Please sign in to access the Affiliate Portal.</p>
      </div>
    );
  }

  return <AffiliatePageInner userId={userId} user={user} />;
}

function AffiliatePageInner({
  userId,
  user,
}: {
  userId: Id<"users">;
  user: { referralCode?: string; isSuperadmin?: boolean };
}) {
  const ensureReferralCode = useMutation(api.mutations.affiliate.ensureReferralCode);
  const referrals = useQuery(
    api.queries.affiliate.getMyReferrals,
    { userId },
  );

  const [referralCode, setReferralCode] = useState<string | null>(
    user?.referralCode ?? null
  );
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("referrals");
  const hasBootstrapped = useRef(false);

  function attemptEnsureCode() {
    setGenerating(true);
    setGenError(false);
    ensureReferralCode({ userId })
      .then((code) => setReferralCode(code))
      .catch((err) => {
        console.error("Failed to generate referral code:", err);
        setGenError(true);
      })
      .finally(() => setGenerating(false));
  }

  // On mount: if no code yet, generate one
  useEffect(() => {
    if (user?.referralCode) {
      setReferralCode(user.referralCode);
      return;
    }
    if (hasBootstrapped.current || generating || referralCode) return;

    hasBootstrapped.current = true;
    attemptEnsureCode();
  }, [user, generating, referralCode]);

  if (generating) return <PageLoader />;

  if (genError && !referralCode) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-red-600 mb-3">
          Failed to generate your referral code.
        </p>
        <button
          onClick={() => {
            hasBootstrapped.current = false;
            attemptEnsureCode();
          }}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!referralCode) return <PageLoader />;

  const fullUrl = `${getReferralBaseUrl()}${referralCode}`;
  const socialCaption = `Need a reliable cleaner or want to join our team? Check this out: ${fullUrl}`;

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  const isSuperAdmin = user?.isSuperadmin ?? false;

  const tabs: { key: Tab; label: string }[] = [
    { key: "referrals", label: "Referrals" },
    { key: "revenue", label: "Revenue" },
    { key: "ledger", label: "Ledger" },
    ...(isSuperAdmin
      ? [{ key: "requests" as Tab, label: "Payout Requests" }]
      : []),
  ];

  return (
    <div>
      <PageHeader
        title="Affiliate Portal"
        description="Share your referral link and earn rewards."
      />

      {/* Tab nav */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex gap-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "referrals" && (
        <>
          <div className="bg-white rounded-lg shadow p-6 max-w-xl">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Your referral link
            </label>
            <div className="bg-gray-50 border border-gray-200 rounded-md px-4 py-3 text-sm font-mono text-gray-800 break-all select-all mb-4">
              {fullUrl}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => copyToClipboard(fullUrl, "link")}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
              >
                <Copy className="h-4 w-4" />
                {copied === "link" ? "Copied!" : "Copy link"}
              </button>

              <button
                onClick={() => window.open(fullUrl, "_blank", "noopener,noreferrer")}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                Open link
              </button>

              <button
                onClick={() => copyToClipboard(socialCaption, "social")}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 transition-colors"
              >
                <Share2 className="h-4 w-4" />
                {copied === "social" ? "Copied!" : "Copy social caption"}
              </button>
            </div>
          </div>

          {/* ── Your Referrals ── */}
          <div className="bg-white rounded-lg shadow p-6 max-w-xl mt-6">
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-5 w-5 text-gray-500" />
              <h2 className="text-lg font-semibold text-gray-900">
                Your Referrals
                {referrals && referrals.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    ({referrals.length})
                  </span>
                )}
              </h2>
            </div>

            {referrals === undefined ? (
              <p className="text-sm text-gray-400">Loading...</p>
            ) : referrals.length === 0 ? (
              <p className="text-sm text-gray-500">
                No referrals yet — share your link!
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {referrals.map((r) => (
                  <li key={r.userId} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{r.name}</p>
                      <p className="text-sm text-gray-500">{r.email}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {activeTab === "revenue" && <AffiliateRevenueTab />}

      {activeTab === "ledger" && <AffiliateLedgerTab />}

      {activeTab === "requests" && <PayoutRequestsTab />}
    </div>
  );
}
