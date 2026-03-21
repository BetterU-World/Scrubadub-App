import { useState, useEffect } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader, LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Users, UserPlus, Copy, Check, AlertTriangle } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";

export function EmployeeListPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const employees = useQuery(
    api.queries.employees.list,
    user?.companyId ? { companyId: user.companyId, userId: user._id } : "skip"
  );
  const inviteCleaner = useAction(api.employeeActions.inviteCleaner);
  const resendInviteEmail = useAction(api.employeeActions.resendInviteEmail);
  const updateStatus = useMutation(api.mutations.employees.updateEmployeeStatus);

  const [showInvite, setShowInvite] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("invite") === "true";
  });

  // Clean up URL param after opening
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("invite") === "true") {
      params.delete("invite");
      const qs = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, []);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"cleaner" | "maintenance" | "manager">("cleaner");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [inviteEmailSent, setInviteEmailSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  // Manager permission flags for invite
  const [mgrPerms, setMgrPerms] = useState({
    canSeeAllJobs: false,
    canCreateJobs: false,
    canAssignCleaners: false,
    canRequestRework: false,
    canApproveForms: false,
    canManageSchedule: false,
    canResolveRedFlags: false,
  });
  // Manager permissions dialog
  const [editPermsFor, setEditPermsFor] = useState<string | null>(null);
  const [editPerms, setEditPerms] = useState({
    canSeeAllJobs: false,
    canCreateJobs: false,
    canAssignCleaners: false,
    canRequestRework: false,
    canApproveForms: false,
    canManageSchedule: false,
    canResolveRedFlags: false,
  });
  const [editPermsLoading, setEditPermsLoading] = useState(false);
  const updateManagerPermissions = useMutation(api.mutations.employees.updateManagerPermissions);

  // Cleaner usage for cap enforcement
  const cleanerUsage = useQuery(
    api.queries.billing.getCleanerUsageForUI,
    user?.companyId ? { companyId: user.companyId, userId: user._id } : "skip"
  );

  // Default manager
  const companyProfile = useQuery(
    api.queries.companies.getCompanyProfile,
    user ? { userId: user._id } : "skip"
  );
  const setDefaultManager = useMutation(api.mutations.companies.setDefaultManager);

  if (!user || employees === undefined) return <PageLoader />;

  const cleanerCapReached =
    cleanerUsage &&
    cleanerUsage.limit !== null &&
    cleanerUsage.activeCleaners >= cleanerUsage.limit;

  const handleInvite = async () => {
    if (!user.companyId) return;
    setError("");
    setInviteLoading(true);
    try {
      const inviteArgs: Record<string, unknown> = {
        companyId: user.companyId,
        email: inviteEmail,
        name: inviteName,
        userId: user._id,
        role: inviteRole,
      };
      if (inviteRole === "manager") {
        Object.assign(inviteArgs, mgrPerms);
      }
      const result = await inviteCleaner(inviteArgs as any);
      setInviteLink(`${window.location.origin}/invite/${result.token}`);
      setInviteEmailSent(result.emailSent);
      setToast(result.emailSent ? t("employees.inviteCreatedAndEmailed") : t("employees.inviteCreatedCopyLink"));
      setTimeout(() => setToast(null), 3000);
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
    setInviteRole("cleaner");
    setInviteLink("");
    setInviteEmailSent(false);
    setError("");
    setMgrPerms({
      canSeeAllJobs: false, canCreateJobs: false, canAssignCleaners: false,
      canRequestRework: false, canApproveForms: false, canManageSchedule: false,
      canResolveRedFlags: false,
    });
  };

  return (
    <div>
      <PageHeader
        title={t("employees.title")}
        description={t("employees.description")}
        action={
          <button onClick={() => setShowInvite(true)} className="btn-primary flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> {t("employees.inviteEmployee")}
          </button>
        }
      />

      {/* Cleaner usage indicator */}
      {cleanerUsage && cleanerUsage.limit !== null && (
        <div className={`mb-4 p-3 rounded-lg border flex items-center justify-between flex-wrap gap-2 ${
          cleanerCapReached
            ? "bg-amber-50 border-amber-200"
            : "bg-gray-50 border-gray-200"
        }`}>
          <div className="flex items-center gap-2">
            {cleanerCapReached && <AlertTriangle className="w-4 h-4 text-amber-500" />}
            <span className="text-sm font-medium text-gray-700">
              Cleaners: {cleanerUsage.activeCleaners} / {cleanerUsage.limit} used
            </span>
            <span className="text-xs text-gray-400">({cleanerUsage.planName} plan)</span>
          </div>
          {cleanerCapReached && (
            <Link href="/settings" className="text-sm font-medium text-primary-600 hover:text-primary-700">
              Upgrade Plan
            </Link>
          )}
        </div>
      )}

      {/* Default manager selector */}
      {(() => {
        const activeManagers = employees.filter((e) => e.role === "manager" && e.status === "active");
        if (activeManagers.length === 0) return null;
        return (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200 flex items-center gap-3 flex-wrap">
            <label className="text-sm font-medium text-gray-700">{t("employees.defaultManager")}:</label>
            <select
              className="input-field text-sm py-1.5 w-auto"
              value={companyProfile?.defaultManagerId ?? ""}
              onChange={async (e) => {
                if (!user) return;
                await setDefaultManager({
                  userId: user._id,
                  managerId: e.target.value ? (e.target.value as any) : undefined,
                });
              }}
            >
              <option value="">{t("employees.noDefaultManager")}</option>
              {activeManagers.map((m) => (
                <option key={m._id} value={m._id}>{m.name}</option>
              ))}
            </select>
            <span className="text-xs text-gray-400">{t("employees.defaultManagerHint")}</span>
          </div>
        );
      })()}

      {employees.length <= 1 ? (
        <EmptyState
          icon={Users}
          title={t("employees.noTeamYet")}
          description={t("employees.noTeamDesc")}
          action={
            <button onClick={() => setShowInvite(true)} className="btn-primary">{t("employees.inviteEmployee")}</button>
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">{t("employees.name")}</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">{t("employees.email")}</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">{t("employees.role")}</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">{t("employees.status")}</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">{t("employees.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp._id} className="border-b border-gray-100 last:border-0">
                  <td className="py-3 px-4 text-sm font-medium text-gray-900">{emp.name}</td>
                  <td className="py-3 px-4 text-sm text-gray-500">{emp.email}</td>
                  <td className="py-3 px-4 text-sm text-gray-500 capitalize">{emp.role}</td>
                  <td className="py-3 px-4"><StatusBadge status={emp.status} /></td>
                  <td className="py-3 px-4 text-right space-x-2">
                    {emp.role === "manager" && emp.status === "active" && (
                      <button
                        onClick={() => {
                          setEditPermsFor(emp._id);
                          setEditPerms({
                            canSeeAllJobs: !!(emp as any).canSeeAllJobs,
                            canCreateJobs: !!(emp as any).canCreateJobs,
                            canAssignCleaners: !!(emp as any).canAssignCleaners,
                            canRequestRework: !!(emp as any).canRequestRework,
                            canApproveForms: !!(emp as any).canApproveForms,
                            canManageSchedule: !!(emp as any).canManageSchedule,
                            canResolveRedFlags: !!(emp as any).canResolveRedFlags,
                          });
                        }}
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Permissions
                      </button>
                    )}
                    {emp.role !== "owner" && emp.status !== "pending" && (
                      <button
                        onClick={() => updateStatus({
                          employeeId: emp._id,
                          status: emp.status === "active" ? "inactive" : "active",
                          userId: user._id,
                        })}
                        className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                      >
                        {emp.status === "active" ? t("employees.deactivate") : t("employees.activate")}
                      </button>
                    )}
                    {emp.status === "pending" && (
                      <span className="text-sm text-gray-400">{t("employees.invitePending")}</span>
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
              <Dialog.Title className="text-lg font-semibold">{t("employees.inviteEmployee")}</Dialog.Title>
              <Dialog.Close className="p-1 text-gray-400 hover:text-gray-600 rounded">
                <X className="w-5 h-5" />
              </Dialog.Close>
            </div>

            {inviteLink ? (
              <div>
                {inviteEmailSent ? (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg mb-3">
                    <p className="text-sm font-medium text-green-800">{t("employees.emailSentConfirm", { email: inviteEmail })}</p>
                    <p className="text-xs text-green-600 mt-1">{t("employees.emailSentDesc")}</p>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-3">
                    <p className="text-sm font-medium text-amber-800">{t("employees.emailNotSent")}</p>
                    <p className="text-xs text-amber-600 mt-1">{t("employees.emailNotSentDesc")}</p>
                  </div>
                )}
                <p className="text-sm text-gray-600 mb-2">{t("employees.shareLinkManually", { name: inviteName })}</p>
                <div className="flex gap-2">
                  <input className="input-field text-sm" value={inviteLink} readOnly />
                  <button onClick={copyLink} className="btn-secondary flex items-center gap-1">
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? t("employees.copied") : t("employees.copy")}
                  </button>
                </div>
                {!inviteEmailSent && (
                  <button
                    onClick={async () => {
                      try {
                        const result = await resendInviteEmail({
                          userId: user._id,
                          companyId: user.companyId!,
                          employeeEmail: inviteEmail,
                        });
                        if (result.emailSent) {
                          setInviteEmailSent(true);
                          setToast(t("employees.emailResentSuccess"));
                          setTimeout(() => setToast(null), 3000);
                        } else {
                          setToast(t("employees.emailNotSent"));
                          setTimeout(() => setToast(null), 3000);
                        }
                      } catch (err: any) {
                        setToast(err.message ?? t("common.failed"));
                        setTimeout(() => setToast(null), 3000);
                      }
                    }}
                    className="btn-secondary w-full mt-2 text-sm"
                  >
                    {t("employees.resendEmail")}
                  </button>
                )}
                <button onClick={resetInviteDialog} className="btn-primary w-full mt-3">{t("employees.done")}</button>
              </div>
            ) : (
              <div className="space-y-4">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("employees.name")}</label>
                  <input className="input-field" value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Jane Doe" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("employees.email")}</label>
                  <input className="input-field" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="jane@email.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("employees.role")}</label>
                  <select className="input-field" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as any)}>
                    <option value="cleaner">{t("employees.roleCleaner")}</option>
                    <option value="maintenance">{t("employees.roleMaintenance")}</option>
                    <option value="manager">Manager</option>
                  </select>
                </div>
                {inviteRole === "manager" && (
                  <div className="p-3 bg-gray-50 rounded-lg space-y-2">
                    <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Manager Permissions</p>
                    {([
                      ["canSeeAllJobs", "Can see all jobs"],
                      ["canCreateJobs", "Can create jobs"],
                      ["canAssignCleaners", "Can assign cleaners"],
                      ["canRequestRework", "Can request rework"],
                      ["canApproveForms", "Can approve forms"],
                      ["canManageSchedule", "Can manage schedule"],
                      ["canResolveRedFlags", "Can resolve red flags"],
                    ] as const).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={mgrPerms[key]}
                          onChange={(e) => setMgrPerms((p) => ({ ...p, [key]: e.target.checked }))}
                          className="rounded border-gray-300"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                )}
                <p className="text-xs text-gray-400">{t("employees.inviteWillEmail")}</p>
                {inviteRole === "cleaner" && cleanerCapReached ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm font-medium text-amber-800">
                      Your {cleanerUsage?.planName} plan includes {cleanerUsage?.limit === 1 ? "1 cleaner" : `up to ${cleanerUsage?.limit} cleaners`}. Upgrade to add more cleaners.
                    </p>
                    <Link href="/settings" className="text-sm font-medium text-primary-600 hover:text-primary-700 mt-1 inline-block">
                      Upgrade Plan
                    </Link>
                  </div>
                ) : (
                  <button
                    onClick={handleInvite}
                    disabled={!inviteName || !inviteEmail || inviteLoading}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    {inviteLoading && <LoadingSpinner size="sm" />}
                    {t("employees.createAndSendInvite")}
                  </button>
                )}
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Manager Permissions Dialog */}
      <Dialog.Root open={!!editPermsFor} onOpenChange={(open) => { if (!open) setEditPermsFor(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-lg p-6 w-full max-w-md z-50">
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="text-lg font-semibold">Manager Permissions</Dialog.Title>
              <Dialog.Close className="p-1 text-gray-400 hover:text-gray-600 rounded">
                <X className="w-5 h-5" />
              </Dialog.Close>
            </div>
            <div className="space-y-3">
              {([
                ["canSeeAllJobs", "Can see all jobs"],
                ["canCreateJobs", "Can create jobs"],
                ["canAssignCleaners", "Can assign cleaners"],
                ["canRequestRework", "Can request rework"],
                ["canApproveForms", "Can approve forms"],
                ["canManageSchedule", "Can manage schedule"],
                ["canResolveRedFlags", "Can resolve red flags"],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={editPerms[key]}
                    onChange={(e) => setEditPerms((p) => ({ ...p, [key]: e.target.checked }))}
                    className="rounded border-gray-300"
                  />
                  {label}
                </label>
              ))}
            </div>
            <button
              onClick={async () => {
                if (!editPermsFor) return;
                setEditPermsLoading(true);
                try {
                  await updateManagerPermissions({
                    employeeId: editPermsFor as any,
                    userId: user._id,
                    ...editPerms,
                  });
                  setEditPermsFor(null);
                  setToast("Permissions updated");
                  setTimeout(() => setToast(null), 3000);
                } catch (err: any) {
                  setError(err.message || "Failed to update permissions");
                } finally {
                  setEditPermsLoading(false);
                }
              }}
              disabled={editPermsLoading}
              className="btn-primary w-full mt-4 flex items-center justify-center gap-2"
            >
              {editPermsLoading && <LoadingSpinner size="sm" />}
              Save Permissions
            </button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium bg-green-600 text-white">
          {toast}
        </div>
      )}
    </div>
  );
}
