import { useState, useMemo } from "react";
import {
  Copy,
  Check,
  ExternalLink,
  QrCode,
  MessageSquare,
  Globe,
  ClipboardCheck,
  UserPlus,
  Loader2,
} from "lucide-react";
import qrcode from "qrcode-generator";

interface ShareKitProps {
  slug: string;
  publicRequestToken: string | null;
  brandName: string;
}

export function ShareKit({ slug, publicRequestToken, brandName }: ShareKitProps) {
  const origin = window.location.origin;
  const siteUrl = `${origin}/${slug}`;
  const requestUrl = publicRequestToken
    ? `${origin}/r/${publicRequestToken}`
    : null;
  const cleanerUrl = `${origin}/${slug}/cleaner`;

  return (
    <div className="card mt-6">
      <h3 className="text-base font-semibold text-gray-900 mb-4">
        Share Kit
      </h3>

      <div className="space-y-4">
        <ShareRow
          icon={Globe}
          label="Website"
          url={siteUrl}
        />
        {requestUrl ? (
          <ShareRow
            icon={ClipboardCheck}
            label="Booking Link"
            url={requestUrl}
            caption={`Need a clean? Request service from ${brandName} here: ${requestUrl}`}
          />
        ) : (
          <div className="border border-gray-200 rounded-lg p-3">
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded bg-gray-100 text-gray-400 flex-shrink-0">
                <ClipboardCheck className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700">
                  Booking Link
                </p>
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Generating booking link&hellip;
                </p>
              </div>
            </div>
          </div>
        )}
        <ShareRow
          icon={UserPlus}
          label="Employee Application"
          url={cleanerUrl}
          caption={`Want to work with ${brandName}? Apply here: ${cleanerUrl}`}
        />
      </div>
    </div>
  );
}

// ── QR code helper ───────────────────────────────────────────────────

function generateQrDataUrl(text: string): string {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createDataURL(4, 0);
}

// ── Share row ────────────────────────────────────────────────────────

function ShareRow({
  icon: Icon,
  label,
  url,
  caption,
}: {
  icon: typeof Globe;
  label: string;
  url: string;
  caption?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const qrSrc = useMemo(() => (showQr ? generateQrDataUrl(url) : ""), [showQr, url]);

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyCaption = () => {
    if (caption) {
      navigator.clipboard.writeText(caption);
      setCopiedCaption(true);
      setTimeout(() => setCopiedCaption(false), 2000);
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <div className="flex items-center gap-3">
        <div className="p-1.5 rounded bg-gray-100 text-gray-500 flex-shrink-0">
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-700">{label}</p>
          <p className="text-xs text-primary-600 truncate">{url}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-2">
        <button
          type="button"
          onClick={handleCopy}
          className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-2.5"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>

        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-2.5"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open
        </a>

        <button
          type="button"
          onClick={() => setShowQr((p) => !p)}
          className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-2.5"
        >
          <QrCode className="w-3.5 h-3.5" />
          {showQr ? "Hide QR" : "QR"}
        </button>

        {caption && (
          <button
            type="button"
            onClick={handleCopyCaption}
            className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-2.5"
          >
            {copiedCaption ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <MessageSquare className="w-3.5 h-3.5" />
            )}
            {copiedCaption ? "Copied" : "Caption"}
          </button>
        )}
      </div>

      {showQr && qrSrc && (
        <div className="mt-3 flex justify-center">
          <img
            src={qrSrc}
            alt={`QR code for ${label}`}
            className="w-36 h-36 border border-gray-200 rounded"
          />
        </div>
      )}
    </div>
  );
}
