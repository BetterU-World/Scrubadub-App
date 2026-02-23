import { useState } from "react";
import { Copy, Check, X, ExternalLink } from "lucide-react";

const LS_KEY = "scrubadub_success_seen";

interface SuccessModalProps {
  slug: string;
  publicRequestToken: string | null;
  onDismiss: () => void;
}

export function SuccessModal({
  slug,
  publicRequestToken,
  onDismiss,
}: SuccessModalProps) {
  const origin = window.location.origin;
  const siteUrl = `${origin}/${slug}`;
  const requestUrl = publicRequestToken
    ? `${origin}/r/${publicRequestToken}`
    : null;
  const cleanerUrl = `${origin}/${slug}/cleaner`;

  const handleDismiss = () => {
    localStorage.setItem(LS_KEY, "1");
    onDismiss();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/40"
        onClick={handleDismiss}
      />
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-5">
        {/* Close */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center">
          <p className="text-3xl mb-2">🎉</p>
          <h2 className="text-xl font-bold text-gray-900">
            Your cleaning business is live!
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Share these links with clients and cleaners.
          </p>
        </div>

        {/* Links */}
        <div className="space-y-3">
          <CopyRow label="Website" url={siteUrl} />
          {requestUrl && (
            <CopyRow label="Request link" url={requestUrl} />
          )}
          <CopyRow label="Hiring link" url={cleanerUrl} />
        </div>

        {/* Checklist */}
        <div className="border-t pt-4">
          <p className="text-sm font-medium text-gray-700 mb-2">
            Next steps
          </p>
          <ul className="space-y-1.5 text-sm text-gray-600">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0" />
              Add your services on the{" "}
              <a href="/site" className="text-primary-600 hover:underline">
                Site page
              </a>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0" />
              Share your request link with clients
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0" />
              Invite cleaners from the{" "}
              <a
                href="/employees"
                className="text-primary-600 hover:underline"
              >
                Team page
              </a>
            </li>
          </ul>
        </div>

        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          className="btn-primary w-full"
        >
          Got it, let's go
        </button>
      </div>
    </div>
  );
}

export function shouldShowSuccessModal(): boolean {
  return localStorage.getItem(LS_KEY) !== "1";
}

export function clearSuccessFlag(): void {
  localStorage.removeItem(LS_KEY);
}

// ── Copy row ──────────────────────────────────────────────────────────

function CopyRow({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-3">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p className="text-sm text-primary-600 truncate">{url}</p>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-200 flex-shrink-0"
        title="Copy"
      >
        {copied ? (
          <Check className="w-4 h-4 text-green-600" />
        ) : (
          <Copy className="w-4 h-4" />
        )}
      </button>
    </div>
  );
}
