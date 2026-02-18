import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader, LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Users, UserPlus, Copy, Check, ExternalLink } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

export function EmployeeListPage() {
  const { user, sessionToken } = useAuth();
  const employees = useQuery(
    api.queries.employees.list,
    sessionToken ? { sessionToken } : "skip"
  );
  const inviteCleaner = useMutation(api.mutations.employees.inviteCleaner);
  const updateStatus = useMutation(api.mutations.employees.updateEmployeeStatus);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  if (!user || employees === undefined) return <PageLoader />;

  const handleInvite = async () => {
    if (!sessionToken) return;
    setError("");
    setInviteLoading(true);
    try {
      const result = await inviteCleaner({
        sessionToken: sessionToken!,
        email: inviteEmail,
        name: inviteName,
      });
      setInviteLink(`${window.location.origin}/invite/${result.token}`);
    } catch (err: any) {
      setError(err.message || "Failed to invite");
    } finally {
      setInviteLoading(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resetInviteDialog = () => {
    setShowInvite(false);
    setInviteName("");
    setInviteEmail("");
    setInviteLink("");
    setError("");
  };

  return (
    <div>
      <PageHeader
        title="Employees"
        description="Manage your cleaning team"
        action={
          <button onClick={() => setShowInvite(true)} className="btn-primary flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> Invite Cleaner
          </button>
        }
      />

      {employees.length <= 1 ? (
        <EmptyState
          icon={Users}
          title="No team members yet"
          description="Invite cleaners to join your team"
          action={
            <button onClick={() => setShowInvite(true)} className="btn-primary">Invite Cleaner</button>
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Name</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Email</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Role</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Status</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp._id} className="border-b border-gray-100 last:border-0">
                  <td className="py-3 px-4 text-sm font-medium text-gray-900">{emp.name}</td>
                  <td className="py-3 px-4 text-sm text-gray-500">{emp.email}</td>
                  <td className="py-3 px-4 text-sm text-gray-500 capitalize">{emp.role}</td>
                  <td className="py-3 px-4"><StatusBadge status={emp.status} /></td>
                  <td className="py-3 px-4 text-right">
                    {emp.role !== "owner" && emp.status !== "pending" && (
                      <button
                        onClick={() => updateStatus({
                          sessionToken: sessionToken!,
                          userId: emp._id,
                          status: emp.status === "active" ? "inactive" : "active",
                        })}
                        className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                      >
                        {emp.status === "active" ? "Deactivate" : "Activate"}
                      </button>
                    )}
                    {emp.status === "pending" && (
                      <span className="text-sm text-gray-400">Invite pending</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog.Root open={showInvite} onOpenChange={(open) => { if (!open) resetInviteDialog(); else setShowInvite(true); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-lg p-6 w-full max-w-md z-50">
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="text-lg font-semibold">Invite Cleaner</Dialog.Title>
              <Dialog.Close className="p-1 text-gray-400 hover:text-gray-600 rounded">
                <X className="w-5 h-5" />
              </Dialog.Close>
            </div>

            {inviteLink ? (
              <div>
                <p className="text-sm text-gray-600 mb-3">Share this link with {inviteName}:</p>
                <div className="flex gap-2">
                  <input className="input-field text-sm flex-1" value={inviteLink} readOnly />
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={copyLink} className="btn-primary flex-1 flex items-center justify-center gap-2">
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? "Copied!" : "Copy Invite Link"}
                  </button>
                  <button
                    onClick={() => window.open(inviteLink, "_blank")}
                    className="btn-secondary flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" /> Open
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  Send this link to the cleaner. They should open it while logged out.
                </p>
                <button onClick={resetInviteDialog} className="btn-secondary w-full mt-3">Done</button>
              </div>
            ) : (
              <div className="space-y-4">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input className="input-field" value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Jane Doe" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input className="input-field" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="jane@email.com" />
                </div>
                <button
                  onClick={handleInvite}
                  disabled={!inviteName || !inviteEmail || inviteLoading}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {inviteLoading && <LoadingSpinner size="sm" />}
                  Generate Invite Link
                </button>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
