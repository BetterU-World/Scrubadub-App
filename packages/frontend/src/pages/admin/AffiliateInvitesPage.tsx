import { useSimpleFeedbackState } from "@/components/ui/FeedbackProvider";
import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { getStaffSessionToken, useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  UserPlus,
  Copy,
  RefreshCw,
  XCircle,
  Check,
  Mail,
} from "lucide-react";

type InviteStatus = "pending" | "active" | "expired" | "revoked";

function deriveStatus(
  status: string,
  inviteTokenExpiry: number | null
): InviteStatus {
  if (status === "inactive") return "revoked";
  if (status === "active") return "active";
  // status === "pending"
  if (inviteTokenExpiry && inviteTokenExpiry < Date.now()) return "expired";
  return "pending";
}

const statusConfig: Record<
  InviteStatus,
  { label: string; className: string }
> = {
  active: {
    label: "Active",
    className: "bg-green-100 text-green-700",
  },
  pending: {
    label: "Pending",
    className: "bg-yellow-100 text-yellow-700",
  },
  expired: {
    label: "Expired",
    className: "bg-gray-100 text-gray-600",
  },
  revoked: {
    label: "Revoked",
    className: "bg-red-100 text-red-700",
  },
};

export function AffiliateInvitesPage() {
  const { user, sessionToken, isLoading } = useAuth();
  const canAccess = user?.isSuperadmin === true && Boolean(sessionToken);
  const [showModal, setShowModal] = useState(false);

  const affiliates = useQuery(
    api.queries.affiliateInvites.listAffiliateInvites,
    canAccess ? { callerUserId: user!._id, sessionToken } : "skip"
  );

  if (isLoading) return <PageLoader />;
  if (!canAccess) return null;
  if (affiliates === undefined) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Affiliate Invites"
        description="Manage affiliate program invitations"
        action={
          <button
            onClick={() => setShowModal(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Invite Affiliate
          </button>
        }
      />

      {affiliates.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="No affiliate invites yet"
          description='Click "Invite Affiliate" to get started.'
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="block w-full text-sm sm:table">
            <thead className="hidden sm:table-header-group">
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-3 font-medium text-gray-500">
                  Name
                </th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">
                  Email
                </th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">
                  Status
                </th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">
                  Referral Code
                </th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">
                  Created
                </th>
                <th className="text-right py-3 px-3 font-medium text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="block space-y-3 sm:table-row-group sm:space-y-0">
              {affiliates.map((a) => (
                <AffiliateRow
                  key={a._id}
                  affiliate={a}
                  callerUserId={user._id}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <InviteModal
          callerUserId={user._id}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

// ── Row component ───────────────────────────────────────────────────

function AffiliateRow({
  affiliate,
  callerUserId,
}: {
  affiliate: {
    _id: string;
    email: string;
    name: string;
    status: string;
    inviteTokenExpiry: number | null;
    referralCode: string | null;
    affiliateStripeAccountId: string | null;
    _creationTime: number;
  };
  callerUserId: any;
}) {
  const resendInvite = useAction(
    api.affiliateInviteActions.resendAffiliateInvite
  );
  const revokeInvite = useMutation(
    api.mutations.affiliateInvites.revokeAffiliateInvite
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [toast, setToast] = useSimpleFeedbackState();

  const displayStatus = deriveStatus(
    affiliate.status,
    affiliate.inviteTokenExpiry
  );
  const cfg = statusConfig[displayStatus];

  async function handleResend() {
    setBusy("resend");
    try {
      const result = await resendInvite({
        callerUserId,
        sessionToken: getStaffSessionToken(),
        targetUserId: affiliate._id as any,
      });
      await navigator.clipboard.writeText(result.inviteUrl);
      showToast("New invite sent & link copied");
    } catch (err: any) {
      showToast(err.message ?? "Failed to resend");
    } finally {
      setBusy(null);
    }
  }

  async function handleRevoke() {
    setBusy("revoke");
    try {
      await revokeInvite({
        callerUserId,
        sessionToken: getStaffSessionToken(),
        targetUserId: affiliate._id as any,
      });
      showToast("Affiliate revoked");
    } catch (err: any) {
      showToast(err.message ?? "Failed to revoke");
    } finally {
      setBusy(null);
    }
  }

  function showToast(msg: string) {
    setToast(msg);
  }

  const createdDate = new Date(affiliate._creationTime).toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric", year: "numeric" }
  );

  return (
    <>
    <tr
      aria-label={`${affiliate.name}, ${affiliate.email}`}
      className="block rounded-lg border border-gray-200 p-4 sm:table-row sm:rounded-none sm:border-0 sm:border-b sm:border-gray-100 sm:p-0 sm:last:border-0"
    >
      <td className="block min-w-0 p-0 font-medium text-gray-900 sm:table-cell sm:px-3 sm:py-3">
        {affiliate.name}
      </td>
      <td className="block min-w-0 break-all p-0 pt-1 text-gray-600 sm:table-cell sm:break-normal sm:px-3 sm:py-3">
        <span className="mr-1 text-xs font-medium text-gray-400 sm:hidden">Email:</span>
        {affiliate.email}
      </td>
      <td className="block p-0 pt-3 sm:table-cell sm:px-3 sm:py-3">
        <span className="mr-1 text-xs font-medium text-gray-400 sm:hidden">Status:</span>
        <span
          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}
        >
          {cfg.label}
        </span>
        {affiliate.affiliateStripeAccountId && (
          <span className="ml-1.5 inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
            Stripe
          </span>
        )}
      </td>
      <td className="block p-0 pt-2 font-mono text-xs text-gray-600 sm:table-cell sm:px-3 sm:py-3">
        <span className="mr-1 font-sans font-medium text-gray-400 sm:hidden">Referral code:</span>
        {affiliate.referralCode ?? "—"}
      </td>
      <td className="block p-0 pt-2 text-xs text-gray-500 sm:table-cell sm:px-3 sm:py-3">
        <span className="mr-1 font-medium text-gray-400 sm:hidden">Created:</span>
        {createdDate}
      </td>
      <td className="mt-3 block border-t border-gray-100 p-0 pt-3 sm:table-cell sm:border-0 sm:px-3 sm:py-3 sm:mt-0">
        <div className="flex flex-wrap items-center gap-2 sm:justify-end sm:gap-1.5">

          {/* Resend: available for pending or expired */}
          {(displayStatus === "pending" || displayStatus === "expired") && (
            <button
              onClick={handleResend}
              disabled={busy !== null}
              className="touch-target gap-2 rounded-lg px-3 text-sm font-medium text-primary-600 hover:bg-gray-100 hover:text-primary-700 disabled:opacity-50 sm:px-0 sm:text-gray-400"
              title="Resend invite"
              aria-label={`Resend invite to ${affiliate.email}`}
            >
              <RefreshCw
                className={`w-4 h-4 ${busy === "resend" ? "animate-spin" : ""}`}
              />
              <span className="sm:sr-only">Resend invite</span>
            </button>
          )}

          {/* Revoke: available for pending or active */}
          {(displayStatus === "pending" || displayStatus === "active") && (
            <button
              onClick={() => setConfirmRevoke(true)}
              disabled={busy !== null}
              className="touch-target gap-2 rounded-lg px-3 text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-50 sm:px-0 sm:text-gray-400"
              title="Revoke"
              aria-label={`Revoke affiliate invitation for ${affiliate.email}`}
            >
              <XCircle className="w-4 h-4" />
              <span className="sm:sr-only">Revoke</span>
            </button>
          )}
        </div>
      </td>
    </tr>
    <ConfirmDialog
      open={confirmRevoke}
      onOpenChange={setConfirmRevoke}
      title={`Revoke ${affiliate.name}?`}
      description={`This will revoke affiliate access for ${affiliate.email}.`}
      confirmLabel="Revoke"
      confirmVariant="danger"
      onConfirm={async () => {
        await handleRevoke();
        setConfirmRevoke(false);
      }}
      loading={busy === "revoke"}
    />
    </>
  );
}

// ── Invite modal ────────────────────────────────────────────────────

function InviteModal({
  callerUserId,
  onClose,
}: {
  callerUserId: any;
  onClose: () => void;
}) {
  const inviteAffiliate = useAction(
    api.affiliateInviteActions.inviteAffiliate
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    inviteUrl: string;
    emailSent: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await inviteAffiliate({
        callerUserId,
        sessionToken: getStaffSessionToken(),
        email: email.trim(),
        name: name.trim(),
        sendEmail,
      });
      setResult({ inviteUrl: res.inviteUrl, emailSent: sendEmail });
    } catch (err: any) {
      setError(err.message ?? "Failed to create invite");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        {!result ? (
          <form onSubmit={handleSubmit}>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Invite Affiliate
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="input w-full"
                  placeholder="Jane Doe"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="input w-full"
                  placeholder="jane@example.com"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <Mail className="w-4 h-4 text-gray-400" />
                Send invite email via Resend
              </label>
            </div>

            {error && (
              <p className="mt-3 text-sm text-red-600">{error}</p>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary"
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary flex items-center gap-2"
                disabled={busy || !name.trim() || !email.trim()}
              >
                {busy ? (
                  "Creating..."
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    Create Invite
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-full bg-green-100">
                <Check className="w-5 h-5 text-green-600" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">
                Invite Created
              </h2>
            </div>

            {result.emailSent && (
              <p className="text-sm text-gray-600 mb-4">
                Invite email sent to <strong>{email}</strong>.
              </p>
            )}

            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <p className="text-xs text-gray-500 mb-1">Invite Link</p>
              <div className="flex items-center gap-2">
                <code className="text-xs text-gray-700 break-all flex-1">
                  {result.inviteUrl}
                </code>
                <button
                  onClick={handleCopy}
                  className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-gray-200 rounded-lg flex-shrink-0"
                  title="Copy link"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={onClose} className="btn btn-primary">
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
