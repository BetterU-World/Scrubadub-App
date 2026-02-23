import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { requireUserId } from "@/lib/requireUserId";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { Copy, ExternalLink, Share2 } from "lucide-react";

const BASE_URL = "https://scrubscrubscrub.com/?ref=";

export function AffiliatePage() {
  const { user } = useAuth();
  const uid = requireUserId(user);
  const ensureReferralCode = useMutation(api.mutations.affiliate.ensureReferralCode);

  const [referralCode, setReferralCode] = useState<string | null>(
    user?.referralCode ?? null
  );
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // On mount: if no code yet, generate one
  useEffect(() => {
    if (user?.referralCode) {
      setReferralCode(user.referralCode);
      return;
    }
    if (!uid || generating || referralCode) return;

    setGenerating(true);
    ensureReferralCode({ userId: uid })
      .then((code) => setReferralCode(code))
      .catch((err) => console.error("Failed to generate referral code:", err))
      .finally(() => setGenerating(false));
  }, [uid, user?.referralCode, ensureReferralCode, generating, referralCode]);

  if (!user || generating || !referralCode) {
    return <PageLoader />;
  }

  const fullUrl = `${BASE_URL}${referralCode}`;
  const socialCaption = `Need a reliable cleaner or want to join our team? Check this out: ${fullUrl}`;

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <div>
      <PageHeader
        title="Affiliate Portal"
        description="Share your referral link and earn rewards."
      />

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
    </div>
  );
}
