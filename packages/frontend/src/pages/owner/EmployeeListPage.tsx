import { useSimpleFeedbackState } from "@/components/ui/FeedbackProvider";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { getStaffSessionToken, useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader, LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AsyncButton } from "@/components/ui/AsyncButton";
import { Users, UserPlus, Copy, Check, AlertTriangle, Plus, Archive, RotateCcw, Trash2 } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";

function formatLabel(value?: string | null) {
  if (!value) return "Not set";
  return value
    .split("_")
    .map((part) => part === "1099" ? part : part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
    .replace("W2", "W-2");
}

function defaultWorkerTypeForRole(
  role: "cleaner" | "maintenance" | "manager"
): "w2_employee" | "contractor_1099" | "maintenance_contractor" {
  if (role === "maintenance") return "maintenance_contractor";
  if (role === "manager") return "w2_employee";
  return "contractor_1099";
}

export function EmployeeListPage() {
  const { user, sessionToken } = useAuth();
  const { t } = useTranslation();
  const employees = useQuery(
    api.queries.employees.list,
    user?.companyId && sessionToken ? { companyId: user.companyId, userId: user._id, sessionToken } : "skip"
  );
  const workerProfiles = useQuery(
    (api as any).queries.workers.listWorkersForCompany,
    user?.companyId ? { companyId: user.companyId, userId: user._id, sessionToken, includeArchived: true } : "skip"
  );
  const inviteCleaner = useAction(api.employeeActions.inviteCleaner);
  const resendInviteEmail = useAction(api.employeeActions.resendInviteEmail);
  const revokeInvite = useAction(api.employeeActions.revokeInvite);
  const updateStatus = useMutation(api.mutations.employees.updateEmployeeStatus);
  const teams = useQuery(
    (api as any).queries.teams.list,
    user?.companyId ? { companyId: user.companyId, userId: user._id, sessionToken, includeArchived: true } : "skip"
  );
  const createTeam = useMutation((api as any).mutations.teams.create);
  const updateTeam = useMutation((api as any).mutations.teams.update);
  const setTeamActive = useMutation((api as any).mutations.teams.setActive);
  const addTeamMember = useMutation((api as any).mutations.teams.addMember);
  const removeTeamMember = useMutation((api as any).mutations.teams.removeMember);
  const setTeamMemberRoleMut = useMutation((api as any).mutations.teams.setMemberRole);

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
  const [inviteWorkerType, setInviteWorkerType] = useState<"w2_employee" | "contractor_1099" | "maintenance_contractor">("contractor_1099");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [inviteEmailSent, setInviteEmailSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useSimpleFeedbackState();
  const [teamName, setTeamName] = useState("");
  const [teamDescription, setTeamDescription] = useState("");
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [teamMemberUserId, setTeamMemberUserId] = useState<Record<string, string>>({});
const [teamMemberRole, setTeamMemberRole] = useState<Record<string, "lead" | "member">>({});
  // Manager permission flags for invite
  const [mgrPerms, setMgrPerms] = useState({
    canSeeAllJobs: false,
    canCreateJobs: false,
    canAssignCleaners: false,
    canRequestRework: false,
    canApproveForms: false,
    canManageSchedule: false,
    canResolveRedFlags: false,
    canManageBusinessConfiguration: false,
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
    canManageBusinessConfiguration: false,
  });
  const [editPermsLoading, setEditPermsLoading] = useState(false);
  const updateManagerPermissions = useMutation(api.mutations.employees.updateManagerPermissions);

  // Cleaner usage for cap enforcement
  const cleanerUsage = useQuery(
    api.queries.billing.getCleanerUsageForUI,
    user?.companyId && sessionToken
      ? { companyId: user.companyId, sessionToken }
      : "skip"
  );

  // Default manager
  const companyProfile = useQuery(
    api.queries.companies.getCompanyProfile,
    user ? { userId: user._id, sessionToken } : "skip"
  );
  const setDefaultManager = useMutation(api.mutations.companies.setDefaultManager);

  if (!user || employees === undefined || teams === undefined || workerProfiles === undefined) return <PageLoader />;

  const workerProfileByUserId = new Map(
    (workerProfiles ?? []).map((profile: any) => [profile.userId, profile])
  );

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
        sessionToken: getStaffSessionToken(),
        role: inviteRole,
        workerType: inviteWorkerType,
      };
      if (inviteRole === "manager") {
        Object.assign(inviteArgs, mgrPerms);
      }
      const result = await inviteCleaner(inviteArgs as any);
      setInviteLink(`${window.location.origin}/invite/${result.token}`);
      setInviteEmailSent(result.emailSent);
      setToast(result.emailSent ? t("employees.inviteCreatedAndEmailed") : t("employees.inviteCreatedCopyLink"));
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
    setInviteWorkerType("contractor_1099");
    setInviteLink("");
    setInviteEmailSent(false);
    setError("");
    setMgrPerms({
      canSeeAllJobs: false, canCreateJobs: false, canAssignCleaners: false,
      canRequestRework: false, canApproveForms: false, canManageSchedule: false,
      canResolveRedFlags: false,
      canManageBusinessConfiguration: false,
    });
  };

  return (
    <div>
      <PageHeader
        title={t("employees.title")}
        description={t("guidance.owner.workers")}
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
            <Link href="/owner/settings" className="text-sm font-medium text-primary-600 hover:text-primary-700">
              Upgrade Plan
            </Link>
          )}
        </div>
      )}


      {/* Teams management */}
      <div className="card mb-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Cleaner Teams</h2>
            <p className="text-sm text-gray-500">Create reusable teams of cleaners, maintenance workers, and managers for team-assigned jobs.</p>
          </div>
        </div>
        <div className="grid md:grid-cols-[1fr_2fr_auto] gap-3">
          <input
            className="input-field"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="Team name"
          />
          <input
            className="input-field"
            value={teamDescription}
            onChange={(e) => setTeamDescription(e.target.value)}
            placeholder="Description (optional)"
          />
          <button
            className="btn-primary flex items-center justify-center gap-2"
            disabled={!teamName.trim()}
            onClick={async () => {
              try {
                if (editingTeamId) {
                  await updateTeam({ userId: user._id, sessionToken, teamId: editingTeamId as any, name: teamName, description: teamDescription || undefined });
                  setToast("Team updated");
                } else {
                  await createTeam({ userId: user._id, sessionToken, companyId: user.companyId!, name: teamName, description: teamDescription || undefined });
                  setToast("Team created");
                }
                setTeamName("");
                setTeamDescription("");
                setEditingTeamId(null);
              } catch (err: any) {
                setError(err.message || "Failed to save team");
              }
            }}
          >
            <Plus className="w-4 h-4" /> {editingTeamId ? "Save Team" : "Create Team"}
          </button>
        </div>
        {editingTeamId && (
          <button className="text-sm text-gray-500 hover:text-gray-700" onClick={() => { setEditingTeamId(null); setTeamName(""); setTeamDescription(""); }}>
            Cancel editing
          </button>
        )}
        <div className="space-y-3">
          {teams.length === 0 ? (
            <p className="text-sm text-gray-500">No teams yet.</p>
          ) : teams.map((team: any) => {
            const candidates = employees.filter((e) => ["cleaner", "maintenance", "manager"].includes(e.role) && e.status === "active" && !team.members.some((m: any) => m.active && m.userId === e._id));
            return (
              <div key={team._id} className={`rounded-lg border p-3 ${team.active ? "border-gray-200" : "border-gray-200 bg-gray-50 opacity-75"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{team.name}</h3>
                      {!team.active && <span className="badge bg-gray-200 text-gray-600">archived</span>}
                      <span className="text-xs text-gray-400">{team.activeMemberCount} active member(s)</span>
                    </div>
                    {team.description && <p className="text-sm text-gray-500 mt-0.5">{team.description}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button className="text-sm text-primary-600 hover:text-primary-700 font-medium" onClick={() => { setEditingTeamId(team._id); setTeamName(team.name); setTeamDescription(team.description ?? ""); }}>
                      Edit
                    </button>
                    <button
                      className="text-sm text-gray-600 hover:text-gray-800 font-medium flex items-center gap-1"
                      onClick={() => setTeamActive({ userId: user._id, sessionToken, teamId: team._id, active: !team.active })}
                    >
                      {team.active ? <Archive className="w-3.5 h-3.5" /> : <RotateCcw className="w-3.5 h-3.5" />}
                      {team.active ? "Archive" : "Reactivate"}
                    </button>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {team.members.filter((m: any) => m.active).map((member: any) => (
                    <div key={member._id} className="flex items-center justify-between gap-3 rounded bg-gray-50 px-3 py-2 text-sm">
                      <div>
                        <span className="font-medium text-gray-900">{member.user?.name ?? "Unknown"}</span>
                        <span className="text-gray-400 ml-2">{member.user?.role}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          className="input-field py-1 text-xs w-auto"
                          value={member.role}
                          onChange={(e) => setTeamMemberRoleMut({ userId: user._id, sessionToken, membershipId: member._id, role: e.target.value as "lead" | "member" })}
                        >
                          <option value="member">member</option>
                          <option value="lead">lead</option>
                        </select>
                        <button className="text-red-600 hover:text-red-700" onClick={() => removeTeamMember({ userId: user._id, sessionToken, membershipId: member._id })} title="Remove member">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {team.active && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      <select
                        className="input-field py-1.5 text-sm flex-1 min-w-[180px]"
                        value={teamMemberUserId[team._id] ?? ""}
                        onChange={(e) => setTeamMemberUserId((p) => ({ ...p, [team._id]: e.target.value }))}
                      >
                        <option value="">Add employee…</option>
                        {candidates.map((emp) => <option key={emp._id} value={emp._id}>{emp.name} ({emp.role})</option>)}
                      </select>
                      <select
                        className="input-field py-1.5 text-sm w-auto"
                        value={teamMemberRole[team._id] ?? "member"}
                        onChange={(e) => setTeamMemberRole((p) => ({ ...p, [team._id]: e.target.value as "lead" | "member" }))}
                      >
                        <option value="member">member</option>
                        <option value="lead">lead</option>
                      </select>
                      <button
                        className="btn-secondary text-sm"
                        disabled={!teamMemberUserId[team._id]}
                        onClick={() => addTeamMember({ userId: user._id, sessionToken, teamId: team._id, memberUserId: teamMemberUserId[team._id] as any, role: teamMemberRole[team._id] ?? "member" })}
                      >
                        Add
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

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
                  sessionToken,
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
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">{t("employees.name")}</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">{t("employees.email")}</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">{t("employees.role")}</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Worker Type</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Onboarding</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Eligibility</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">{t("employees.status")}</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">{t("employees.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => {
                const workerProfile = workerProfileByUserId.get(emp._id) as any;
                return (
                <tr key={emp._id} className="border-b border-gray-100 last:border-0">
                  <td className="py-3 px-4 text-sm font-medium text-gray-900">
                    {emp.role === "owner" ? (
                      emp.name
                    ) : (
                      <Link href={`/employees/${emp._id}`} className="text-primary-700 hover:text-primary-800">
                        {emp.name}
                      </Link>
                    )}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-500">{emp.email}</td>
                  <td className="py-3 px-4 text-sm text-gray-500">{formatLabel(workerProfile?.primaryRole ?? emp.role)}</td>
                  <td className="py-3 px-4 text-sm text-gray-500">{formatLabel(workerProfile?.workerType)}</td>
                  <td className="py-3 px-4 text-sm text-gray-500">{formatLabel(workerProfile?.onboardingStatus)}</td>
                  <td className="py-3 px-4 text-sm text-gray-500">{formatLabel(workerProfile?.jobEligibilityStatus)}</td>
                  <td className="py-3 px-4">
                    {(emp as any).invitationStatus ? (
                      <span className={`badge ${
                        (emp as any).invitationStatus === "accepted" ? "bg-green-100 text-green-700" :
                        (emp as any).invitationStatus === "expired" ? "bg-amber-100 text-amber-700" :
                        (emp as any).invitationStatus === "revoked" ? "bg-gray-200 text-gray-700" :
                        "bg-blue-100 text-blue-700"
                      }`}>{formatLabel((emp as any).invitationStatus)}</span>
                    ) : <StatusBadge status={workerProfile?.workerStatus ?? emp.status} />}
                  </td>
                  <td className="py-3 px-4 text-right space-x-2">
                    {emp.role !== "owner" && (
                      <Link href={`/employees/${emp._id}`} className="text-sm text-gray-600 hover:text-gray-800 font-medium">
                        View
                      </Link>
                    )}
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
                            canManageBusinessConfiguration: !!(emp as any).canManageBusinessConfiguration,
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
                          sessionToken,
                        })}
                        className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                      >
                        {emp.status === "active" ? t("employees.deactivate") : t("employees.activate")}
                      </button>
                    )}
                    {emp.status === "pending" && (
                      <>
                        <button
                          className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                          onClick={async () => {
                            try {
                              await resendInviteEmail({
                                userId: user._id,
                                sessionToken: getStaffSessionToken(),
                                companyId: user.companyId!,
                                employeeId: emp._id,
                              });
                              setToast(t("employees.emailResentSuccess"));
                            } catch {
                              setToast(t("employees.inviteActionFailed"));
                            }
                          }}
                        >{t("employees.resendInvitation")}</button>
                        <button
                          className="text-sm text-red-600 hover:text-red-700 font-medium"
                          onClick={async () => {
                            try {
                              await revokeInvite({
                                userId: user._id,
                                sessionToken: getStaffSessionToken(),
                                companyId: user.companyId!,
                                employeeId: emp._id,
                              });
                              setToast(t("employees.invitationRevoked"));
                            } catch {
                              setToast(t("employees.inviteActionFailed"));
                            }
                          }}
                        >{t("employees.revokeInvitation")}</button>
                      </>
                    )}
                  </td>
                </tr>
                );
              })}
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
                          sessionToken: getStaffSessionToken(),
                          companyId: user.companyId!,
                          employeeEmail: inviteEmail,
                        });
                        if (result.emailSent) {
                          setInviteLink(`${window.location.origin}/invite/${result.token}`);
                          setInviteEmailSent(true);
                          setToast(t("employees.emailResentSuccess"));
                        } else {
                          setToast(t("employees.emailNotSent"));
                        }
                      } catch (err: any) {
                        setToast(err.message ?? t("common.failed"));
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Operational Role</label>
                  <select
                    className="input-field"
                    value={inviteRole}
                    onChange={(e) => {
                      const nextRole = e.target.value as "cleaner" | "maintenance" | "manager";
                      setInviteRole(nextRole);
                      setInviteWorkerType(defaultWorkerTypeForRole(nextRole));
                    }}
                  >
                    <option value="cleaner">{t("employees.roleCleaner")}</option>
                    <option value="maintenance">{t("employees.roleMaintenance")}</option>
                    <option value="manager">Manager</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Worker Type</label>
                  <select
                    className="input-field"
                    value={inviteWorkerType}
                    onChange={(e) => setInviteWorkerType(e.target.value as any)}
                  >
                    <option value="w2_employee">W-2 Employee</option>
                    <option value="contractor_1099">1099 Contractor</option>
                    <option value="maintenance_contractor">Maintenance Contractor</option>
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
                      ["canManageBusinessConfiguration", "Can manage business configuration"],
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
                    <Link href="/owner/settings" className="text-sm font-medium text-primary-600 hover:text-primary-700 mt-1 inline-block">
                      Upgrade Plan
                    </Link>
                  </div>
                ) : (
                  <AsyncButton
                    onClick={handleInvite}
                    pending={inviteLoading}
                    pendingLabel={t("common.inviting")}
                    disabled={!inviteName || !inviteEmail}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    {t("employees.createAndSendInvite")}
                  </AsyncButton>
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
                ["canManageBusinessConfiguration", "Can manage business configuration"],
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
                    sessionToken,
                    ...editPerms,
                  });
                  setEditPermsFor(null);
                  setToast("Permissions updated");
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

    </div>
  );
}
