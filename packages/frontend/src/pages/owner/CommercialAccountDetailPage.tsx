import { useFeedbackState } from "@/components/ui/FeedbackProvider";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useParams } from "wouter";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { CommercialScheduleCard } from "@/components/owner/CommercialScheduleCard";
import { ServiceAgreementCard } from "@/components/owner/ServiceAgreementCard";
import { WalkthroughCard } from "@/components/owner/WalkthroughCard";
import { CommercialInvoiceCard } from "@/components/owner/CommercialInvoiceCard";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import {
  Building2,
  ClipboardCheck,
  FileText,
  MapPin,
  Save,
  User,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";

type AccountStatus = "active" | "paused" | "ended";

const FREQUENCIES = ["one_time", "weekly", "biweekly", "monthly", "quarterly", "custom"] as const;
const STATUSES: AccountStatus[] = ["active", "paused", "ended"];

const EMPTY_FORM = {
  clientRelationshipId: "",
  clientName: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  serviceAddress: "",
  contractAmount: "",
  serviceFrequency: "",
  startDate: "",
  renewalDate: "",
  assignedManagerId: "",
  assignedCleanerId: "",
  assignedTeamId: "",
  status: "active" as AccountStatus,
  notes: "",
};

function formatPrice(cents: number | undefined, fallback: string) {
  if (cents == null) return fallback;
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(date: string | undefined, fallback: string) {
  if (!date) return fallback;
  return new Date(`${date}T00:00:00`).toLocaleDateString();
}

function centsFromPrice(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.round(parsed * 100);
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <div className="mt-1 text-sm text-gray-900">{value}</div>
    </div>
  );
}

function ComingSoonCard({
  icon: Icon,
  title,
  label,
}: {
  icon: typeof FileText;
  title: string;
  label: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <Icon className="h-5 w-5 text-gray-400" />
      <h3 className="mt-3 text-sm font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 text-sm text-gray-500">{label}</p>
    </div>
  );
}

export function CommercialAccountDetailPage() {
  const { user, sessionToken } = useAuth();
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const notSet = t("commercialAccounts.notSet");
  const comingSoon = t("commercialAccounts.comingSoon");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useFeedbackState<{ message: string; type: "success" | "error" }>();
  const [form, setForm] = useState(EMPTY_FORM);

  const account = useQuery(
    (api as any).queries.commercialAccounts.getById,
    params.id && user
      ? { userId: user._id, sessionToken, accountId: params.id as Id<"commercialAccounts"> }
      : "skip"
  );
  const managers = useQuery(
    api.queries.employees.getManagers,
    user?.companyId && sessionToken ? { companyId: user.companyId, userId: user._id, sessionToken } : "skip"
  );
  const cleaners = useQuery(
    api.queries.employees.getCleaners,
    user?.companyId && sessionToken ? { companyId: user.companyId, userId: user._id, sessionToken } : "skip"
  );
  const teams = useQuery(
    api.queries.teams.listActiveForAssignment,
    user?.companyId ? { companyId: user.companyId, userId: user._id, sessionToken } : "skip"
  );
  const clientRelationships = useQuery(
    (api as any).queries.clientRelationships.listForSelect,
    user ? { userId: user._id, sessionToken } : "skip"
  );
  const commercialSchedules = useQuery(
    (api as any).queries.commercialSchedules.getByCommercialAccount,
    params.id && user && sessionToken
      ? { userId: user._id, sessionToken, commercialAccountId: params.id as Id<"commercialAccounts"> }
      : "skip"
  );
  const updateCommercialAccount = useMutation(
    (api as any).mutations.commercialAccounts.update
  );

  useEffect(() => {
    if (!account) return;
    setForm({
      clientRelationshipId: account.clientRelationshipId ?? "",
      clientName: account.clientName ?? "",
      contactName: account.contactName ?? "",
      contactEmail: account.contactEmail ?? "",
      contactPhone: account.contactPhone ?? "",
      serviceAddress: account.serviceAddress ?? "",
      contractAmount:
        account.contractAmountCents != null ? String(account.contractAmountCents / 100) : "",
      serviceFrequency: account.serviceFrequency ?? "",
      startDate: account.startDate ?? "",
      renewalDate: account.renewalDate ?? "",
      assignedManagerId: account.assignedManagerId ?? "",
      assignedCleanerId: account.assignedCleanerId ?? "",
      assignedTeamId: account.assignedTeamId ?? "",
      status: account.status ?? "active",
      notes: account.notes ?? "",
    });
  }, [account?._id]);

  if (!user || account === undefined || commercialSchedules === undefined) return <PageLoader />;
  if (!account) {
    return <div className="py-12 text-center text-gray-500">{t("commercialAccounts.notFound")}</div>;
  }

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
  };
  const scheduledServiceLocations = Array.from(
    new Map(
      commercialSchedules
        .filter((schedule: any) => schedule.propertyId && schedule.propertyName)
        .map((schedule: any) => [
          schedule.propertyId,
          { _id: schedule.propertyId, name: schedule.propertyName },
        ])
    ).values()
  ) as Array<{ _id: Id<"properties">; name: string }>;

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateCommercialAccount({
        userId: user._id,
        sessionToken,
        accountId: account._id,
        clientRelationshipId: (form.clientRelationshipId || undefined) as any,
        clientName: form.clientName,
        contactName: form.contactName || undefined,
        contactEmail: form.contactEmail || undefined,
        contactPhone: form.contactPhone || undefined,
        serviceAddress: form.serviceAddress || undefined,
        contractAmountCents: centsFromPrice(form.contractAmount),
        serviceFrequency: (form.serviceFrequency || undefined) as any,
        startDate: form.startDate || undefined,
        renewalDate: form.renewalDate || undefined,
        assignedManagerId: (form.assignedManagerId || undefined) as any,
        assignedCleanerId: (form.assignedCleanerId || undefined) as any,
        assignedTeamId: (form.assignedTeamId || undefined) as any,
        status: form.status,
        notes: form.notes || undefined,
      });
      setEditing(false);
      showToast(t("commercialAccounts.updated"), "success");
    } catch (err: any) {
      showToast(err.message || t("commercialAccounts.saveFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={account.clientName}
        description={t("guidance.owner.commercialAccounts")}
        back={{ href: "/commercial-accounts", label: t("navigation.backToCommercialAccounts") }}
        action={
          <div className="flex gap-2">
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-primary flex items-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  {saving ? t("common.saving") : t("commercialAccounts.save")}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="btn-secondary"
                >
                  {t("common.cancel")}
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setEditing(true)} className="btn-primary">
                {t("commercialAccounts.edit")}
              </button>
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <section className="card">
            <div className="mb-4 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900">{t("commercialAccounts.accountInfo")}</h2>
            </div>
            {editing ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">{t("commercialAccounts.clientName")}</span>
                  <input className="input-field mt-1" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">{t("commercialAccounts.status")}</span>
                  <select className="input-field mt-1" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AccountStatus })}>
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>{t(`commercialAccounts.statuses.${status}`)}</option>
                    ))}
                  </select>
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-gray-600">{t("commercialAccounts.client")}</span>
                  <select
                    className="input-field mt-1"
                    value={form.clientRelationshipId}
                    onChange={(e) => setForm({ ...form, clientRelationshipId: e.target.value })}
                  >
                    <option value="">{t("commercialAccounts.noClient")}</option>
                    {(clientRelationships ?? []).map((relationship: any) => (
                      <option key={relationship._id} value={relationship._id}>
                        {relationship.displayName}
                        {relationship.businessName ? ` - ${relationship.businessName}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <DetailItem label={t("commercialAccounts.clientName")} value={account.clientName} />
                <DetailItem
                  label={t("commercialAccounts.status")}
                  value={<span className="badge bg-gray-100 text-gray-700">{t(`commercialAccounts.statuses.${account.status}`)}</span>}
                />
                <DetailItem
                  label={t("commercialAccounts.client")}
                  value={account.clientRelationship ? (
                    <Link href={`/clients/${account.clientRelationship._id}`} className="font-medium text-primary-600 hover:text-primary-700">
                      {account.clientRelationship.displayName}
                    </Link>
                  ) : t("common.unassigned")}
                />
              </div>
            )}
          </section>

          <section className="card">
            <div className="mb-4 flex items-center gap-2">
              <User className="h-5 w-5 text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900">{t("commercialAccounts.contactInfo")}</h2>
            </div>
            {editing ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">{t("commercialAccounts.contactName")}</span>
                  <input className="input-field mt-1" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">{t("common.email")}</span>
                  <input className="input-field mt-1" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">{t("common.phone")}</span>
                  <input className="input-field mt-1" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
                </label>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <DetailItem label={t("commercialAccounts.contactName")} value={account.contactName ?? t("common.unavailable")} />
                <DetailItem label={t("common.email")} value={account.contactEmail ?? t("common.unavailable")} />
                <DetailItem label={t("common.phone")} value={account.contactPhone ?? t("common.unavailable")} />
              </div>
            )}
          </section>

          <section className="card">
            <div className="mb-4 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900">{t("commercialAccounts.serviceInfo")}</h2>
            </div>
            {editing ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-gray-600">{t("commercialAccounts.serviceAddress")}</span>
                  <input className="input-field mt-1" value={form.serviceAddress} onChange={(e) => setForm({ ...form, serviceAddress: e.target.value })} />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">{t("commercialAccounts.contractAmount")}</span>
                  <input type="number" min="0" step="0.01" className="input-field mt-1" value={form.contractAmount} onChange={(e) => setForm({ ...form, contractAmount: e.target.value })} />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">{t("commercialAccounts.frequency")}</span>
                  <select className="input-field mt-1" value={form.serviceFrequency} onChange={(e) => setForm({ ...form, serviceFrequency: e.target.value })}>
                    <option value="">{t("common.select")}</option>
                    {FREQUENCIES.map((frequency) => (
                      <option key={frequency} value={frequency}>{t(`leadFrequencies.${frequency}`)}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">{t("commercialAccounts.startDate")}</span>
                  <input type="date" className="input-field mt-1" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">{t("commercialAccounts.renewalDate")}</span>
                  <input type="date" className="input-field mt-1" value={form.renewalDate} onChange={(e) => setForm({ ...form, renewalDate: e.target.value })} />
                </label>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <DetailItem label={t("commercialAccounts.serviceAddress")} value={account.serviceAddress ?? t("common.unavailable")} />
                <DetailItem label={t("commercialAccounts.contractAmount")} value={formatPrice(account.contractAmountCents, notSet)} />
                <DetailItem label={t("commercialAccounts.frequency")} value={account.serviceFrequency ? t(`leadFrequencies.${account.serviceFrequency}`) : t("common.unassigned")} />
                <DetailItem label={t("commercialAccounts.startDate")} value={formatDate(account.startDate, notSet)} />
                <DetailItem label={t("commercialAccounts.renewalDate")} value={formatDate(account.renewalDate, notSet)} />
              </div>
            )}
          </section>

          <CollapsibleSection title={t("commercialAccounts.assignments")} icon={<Users className="h-5 w-5" />}>
            {editing ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">{t("commercialAccounts.assignedManager")}</span>
                  <select className="input-field mt-1" value={form.assignedManagerId} onChange={(e) => setForm({ ...form, assignedManagerId: e.target.value })}>
                    <option value="">{t("common.unassigned")}</option>
                    {(managers ?? []).map((manager: any) => (
                      <option key={manager._id} value={manager._id}>{manager.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">{t("commercialAccounts.assignedCleaner")}</span>
                  <select className="input-field mt-1" value={form.assignedCleanerId} onChange={(e) => setForm({ ...form, assignedCleanerId: e.target.value })}>
                    <option value="">{t("common.unassigned")}</option>
                    {(cleaners ?? []).map((cleaner: any) => (
                      <option key={cleaner._id} value={cleaner._id}>{cleaner.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">{t("commercialAccounts.assignedTeam")}</span>
                  <select className="input-field mt-1" value={form.assignedTeamId} onChange={(e) => setForm({ ...form, assignedTeamId: e.target.value })}>
                    <option value="">{t("common.unassigned")}</option>
                    {(teams ?? []).map((team: any) => (
                      <option key={team._id} value={team._id}>{team.name}</option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <DetailItem label={t("commercialAccounts.assignedManager")} value={account.assignedManagerName ?? t("common.unassigned")} />
                <DetailItem label={t("commercialAccounts.assignedCleaner")} value={account.assignedCleanerName ?? t("common.unassigned")} />
                <DetailItem label={t("commercialAccounts.assignedTeam")} value={account.assignedTeamName ?? t("common.unassigned")} />
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection title={t("common.notes")}>
            {editing ? (
              <textarea className="input-field" rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            ) : (
              <p className="whitespace-pre-wrap text-sm text-gray-700">
                {account.notes || t("commercialAccounts.noNotes")}
              </p>
            )}
          </CollapsibleSection>
        </div>

        <aside className="space-y-6">
          {account.linkedProperty && (
            <section className="card">
              <div className="mb-4 flex items-center gap-2">
                <MapPin className="h-5 w-5 text-gray-400" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{t("commercialAccounts.sourceProperty")}</h2>
                  <p className="text-xs text-gray-500">{t("commercialAccounts.sourcePropertyHelper")}</p>
                </div>
              </div>
              <Link href={`/properties/${account.linkedProperty._id}`} className="block rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
                <p className="font-medium text-gray-900">{account.linkedProperty.name}</p>
                <p className="mt-1 text-sm text-gray-500">{account.linkedProperty.address}</p>
                <p className="mt-2 text-xs capitalize text-gray-400">{account.linkedProperty.type}</p>
              </Link>
            </section>
          )}

          <section className="card">
            <div className="mb-4 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-gray-400" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{t("commercialAccounts.scheduledServiceLocations")}</h2>
                <p className="text-xs text-gray-500">{t("commercialAccounts.scheduledServiceLocationsHelper")}</p>
              </div>
            </div>
            {scheduledServiceLocations.length > 0 ? (
              <div className="space-y-2">
                {scheduledServiceLocations.map((property) => (
                  <Link key={property._id} href={`/properties/${property._id}`} className="block rounded-lg border border-gray-200 p-3 text-sm font-medium text-gray-900 hover:bg-gray-50 hover:text-primary-700">
                    {property.name}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">{t("commercialAccounts.noScheduledServiceLocations")}</p>
            )}
          </section>

          <section className="card">
            <div className="mb-4 flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900">{t("commercialAccounts.source")}</h2>
            </div>
            {account.sourceLead ? (
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs font-medium text-gray-500">{t("commercialAccounts.sourceLead")}</p>
                  <Link href={`/requests/${account.sourceLead._id}`} className="mt-1 block font-medium text-primary-600 hover:text-primary-700">
                    {account.sourceLead.businessName ?? account.sourceLead.requesterName}
                  </Link>
                </div>
                {account.sourceProposal && (
                  <div>
                    <p className="text-xs font-medium text-gray-500">{t("commercialAccounts.sourceProposal")}</p>
                    <Link href={`/requests/${account.sourceLead._id}`} className="mt-1 block font-medium text-primary-600 hover:text-primary-700">
                      {account.sourceProposal.title}
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500">{t("common.unavailable")}</p>
            )}
          </section>

          <div className="grid gap-3">
            <WalkthroughCard
              commercialAccountId={account._id}
              compact
              onToast={showToast}
            />
            <ServiceAgreementCard
              commercialAccountId={account._id}
              hideWhenMissing
              source={{
                title: `${account.clientName} ${t("serviceAgreements.title")}`,
                serviceFrequency: account.serviceFrequency,
                contractAmountCents: account.contractAmountCents,
                effectiveStartDate: account.startDate,
                renewalDate: account.renewalDate,
                notes: account.notes,
              }}
              onToast={showToast}
            />
            <CollapsibleSection title="Schedule">
            <CommercialScheduleCard
              commercialAccountId={account._id}
              accountName={account.clientName}
              defaultPropertyId={account.linkedProperty?._id}
              defaultStartDate={account.startDate}
              defaultCleanerId={account.assignedCleanerId}
              defaultManagerId={account.assignedManagerId}
              defaultTeamId={account.assignedTeamId}
              onToast={showToast}
            />
            </CollapsibleSection>
            <CollapsibleSection title="Invoices">
            <CommercialInvoiceCard
              commercialAccountId={account._id}
              onToast={showToast}
            />
            </CollapsibleSection>
            <ComingSoonCard icon={User} title={t("commercialAccounts.clientPortal")} label={comingSoon} />
          </div>
        </aside>
      </div>

    </div>
  );
}
