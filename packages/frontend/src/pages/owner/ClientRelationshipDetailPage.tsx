import { useFeedbackState } from "@/components/ui/FeedbackProvider";
import { FormEvent, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { getStaffSessionToken, useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { Clock, Home, Mail, Plus, Phone, Save, User, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { ServiceAgreementStatusBadge } from "@/components/ui/ServiceAgreementStatusBadge";

type ClientType = "residential" | "commercial" | "str" | "property_manager" | "marketplace";
type RelationshipStatus = "active" | "inactive" | "archived";

const CLIENT_TYPES: ClientType[] = ["residential", "commercial", "str", "property_manager", "marketplace"];
const STATUSES: RelationshipStatus[] = ["active", "inactive", "archived"];

const EMPTY_FORM = {
  displayName: "",
  clientType: "residential" as ClientType,
  businessName: "",
  primaryContactName: "",
  email: "",
  phone: "",
  notes: "",
  status: "active" as RelationshipStatus,
};

const EMPTY_LEAD_FORM = {
  requesterName: "",
  requesterEmail: "",
  requesterPhone: "",
  businessName: "",
  notes: "",
};

function formatDate(date: string | number | undefined, fallback: string) {
  if (!date) return fallback;
  if (typeof date === "number") return new Date(date).toLocaleDateString();
  return new Date(`${date}T00:00:00`).toLocaleDateString();
}

function formatCents(cents: number | undefined, fallback: string) {
  if (cents == null) return fallback;
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);
}

function dateTimeLabel(timestamp: string | number | undefined, fallback: string) {
  if (!timestamp) return fallback;
  const date = typeof timestamp === "number" ? new Date(timestamp) : new Date(`${timestamp}T00:00:00`);
  return date.toLocaleDateString();
}

function label(value: string) {
  return value.replace(/_/g, " ");
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      {children}
    </label>
  );
}

function Detail({ icon: Icon, label, value }: { icon?: any; label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </p>
      <div className="mt-1 text-sm text-gray-900">{value}</div>
    </div>
  );
}

function RelatedSection({
  title,
  empty,
  children,
  count,
  action,
}: {
  title: string;
  empty: string;
  children: ReactNode;
  count: number;
  action?: ReactNode;
}) {
  return (
    <CollapsibleSection
      title={title}
      badge={<span className="badge bg-gray-100 text-gray-700">{count}</span>}
      actions={action}
    >
      {count === 0 ? <p className="text-sm text-gray-500">{empty}</p> : children}
    </CollapsibleSection>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function buildTimeline(detail: any, t: any) {
  const events: Array<{ at: number; label: string; sublabel?: string }> = [];
  const push = (at: number | undefined, label: string, sublabel?: string) => {
    if (at) events.push({ at, label, sublabel });
  };
  const pushDate = (date: string | undefined, label: string, sublabel?: string) => {
    if (!date) return;
    const parsed = new Date(`${date}T00:00:00`).getTime();
    if (Number.isFinite(parsed)) events.push({ at: parsed, label, sublabel });
  };

  for (const lead of detail.leads) {
    push(lead.createdAt, t("clientRelationships.timeline.leadCreated"), lead.businessName || lead.requesterName);
  }
  for (const walkthrough of detail.walkthroughs) {
    push(walkthrough.createdAt, t("clientRelationships.timeline.walkthroughCreated"), walkthrough.title);
    push(walkthrough.completedAt, t("clientRelationships.timeline.walkthroughCompleted"), walkthrough.title);
  }
  for (const proposal of detail.proposals) {
    push(proposal.createdAt, t("clientRelationships.timeline.proposalCreated"), proposal.title);
    push(proposal.sentAt, t("clientRelationships.timeline.proposalSent"), proposal.title);
    push(proposal.acceptedAt, t("clientRelationships.timeline.proposalAccepted"), proposal.title);
    push(proposal.declinedAt, t("clientRelationships.timeline.proposalDeclined"), proposal.title);
  }
  for (const agreement of detail.serviceAgreements) {
    push(agreement.createdAt, t("clientRelationships.timeline.agreementCreated"), agreement.title);
    push(agreement.sentAt, t("clientRelationships.timeline.agreementSent"), agreement.title);
    push(agreement.signedAt, t("clientRelationships.timeline.agreementSigned"), agreement.title);
    push(agreement.cancelledAt, t("clientRelationships.timeline.agreementCancelled"), agreement.title);
  }
  for (const account of detail.commercialAccounts) {
    push(account.createdAt, t("clientRelationships.timeline.commercialAccountCreated"), account.clientName);
  }
  for (const invoice of detail.invoices) {
    push(invoice.createdAt, t("clientRelationships.timeline.invoiceCreated"), invoice.invoiceNumber);
    push(invoice.issuedAt, t("clientRelationships.timeline.invoiceIssued"), invoice.invoiceNumber);
    push(invoice.paidAt, t("clientRelationships.timeline.invoicePaid"), invoice.invoiceNumber);
    push(invoice.voidedAt, t("clientRelationships.timeline.invoiceVoid"), invoice.invoiceNumber);
  }
  for (const job of detail.jobs) {
    pushDate(job.scheduledDate, t("clientRelationships.timeline.jobScheduled"), job.scheduledDate);
    push(job.completedAt, t("clientRelationships.timeline.jobCompleted"), job.scheduledDate);
    if (job.status === "approved") {
      push(job.completedAt, t("clientRelationships.timeline.jobApproved"), job.scheduledDate);
    }
  }

  return events.sort((a, b) => b.at - a.at).slice(0, 40);
}

export function ClientRelationshipDetailPage() {
  const { user, sessionToken } = useAuth();
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [editing, setEditing] = useState(false);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingLead, setCreatingLead] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [leadForm, setLeadForm] = useState(EMPTY_LEAD_FORM);
  const [toast, setToast] = useFeedbackState<{ message: string; type: "success" | "error" }>();

  const detail = useQuery(
    (api as any).queries.clientRelationships.getClientRelationshipDetail,
    user && params.id
      ? { userId: user._id, sessionToken, relationshipId: params.id as Id<"clientRelationships"> }
      : "skip"
  );
  const updateRelationship = useMutation((api as any).mutations.clientRelationships.update);
  const createLead = useMutation(api.mutations.clientRequests.createManualClientRequest);
  const inviteClient = useAction(api.clientAuthActions.inviteClient);

  const relationship = detail?.relationship;
  const canManageSales = user?.role === "owner" || user?.canManageSalesAndCommercial === true;
  const notSet = t("clientRelationships.notSet");

  useEffect(() => {
    if (!relationship) return;
    setForm({
      displayName: relationship.displayName ?? "",
      clientType: relationship.clientType ?? "residential",
      businessName: relationship.businessName ?? "",
      primaryContactName: relationship.primaryContactName ?? "",
      email: relationship.email ?? "",
      phone: relationship.phone ?? "",
      notes: relationship.notes ?? "",
      status: relationship.status ?? "active",
    });
    setLeadForm({
      requesterName: relationship.primaryContactName || relationship.displayName || "",
      requesterEmail: relationship.email || "",
      requesterPhone: relationship.phone || "",
      businessName: relationship.businessName || "",
      notes: "",
    });
  }, [relationship?._id]);

  if (!user || detail === undefined) return <PageLoader />;
  if (!detail || !relationship) {
    return <div className="py-12 text-center text-gray-500">{t("clientRelationships.notFound")}</div>;
  }

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await updateRelationship({
        userId: user._id,
        sessionToken,
        relationshipId: relationship._id,
        displayName: form.displayName,
        clientType: form.clientType,
        businessName: form.businessName || undefined,
        primaryContactName: form.primaryContactName || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        notes: form.notes || undefined,
        status: form.status,
      });
      setEditing(false);
      showToast(t("clientRelationships.saved"), "success");
    } catch (err: any) {
      showToast(err.message || t("clientRelationships.saveFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateLead = async (event: FormEvent) => {
    event.preventDefault();
    setCreatingLead(true);
    try {
      const requestId = await createLead({
        userId: user._id,
        sessionToken,
        clientRelationshipId: relationship._id,
        requesterName: leadForm.requesterName,
        requesterEmail: leadForm.requesterEmail,
        requesterPhone: leadForm.requesterPhone || undefined,
        businessName: leadForm.businessName || undefined,
        notes: leadForm.notes || undefined,
        leadType: relationship.clientType === "commercial" ? "commercial" : "other",
        leadStage: "new",
      });
      showToast(t("clientRelationships.leadCreated"), "success");
      setLocation(`/requests/${requestId}`);
    } catch (err: any) {
      showToast(err.message || t("clientRelationships.leadCreateFailed"), "error");
    } finally {
      setCreatingLead(false);
    }
  };

  const handleInviteClient = async () => {
    setInviting(true);
    try {
      const result = await inviteClient({
        userId: user._id,
        sessionToken: getStaffSessionToken(),
        relationshipId: relationship._id,
      });
      if (result.status === "active") {
        showToast(t("clientRelationships.inviteAlreadyActive"), "success");
      } else {
        setInviteLink(result.inviteUrl);
        await navigator.clipboard?.writeText(result.inviteUrl).catch(() => {});
        showToast(
          result.emailSent
            ? t("clientRelationships.inviteSent")
            : t("clientRelationships.inviteLinkReady"),
          "success"
        );
      }
    } catch (err: any) {
      showToast(err.message || t("clientRelationships.inviteFailed"), "error");
    } finally {
      setInviting(false);
    }
  };

  const counts = {
    leads: detail.leads.length,
    properties: detail.properties.length,
    commercialAccounts: detail.commercialAccounts.length,
    openInvoices: detail.invoices.filter((invoice: any) => invoice.status === "issued").length,
    upcomingJobs: detail.jobs.filter((job: any) =>
      job.scheduledDate >= new Date().toISOString().slice(0, 10) &&
      !["approved", "cancelled"].includes(job.status)
    ).length,
    completedJobs: detail.jobs.filter((job: any) => job.completedAt || job.status === "approved").length,
  };
  const totalLinkedRecords =
    counts.leads +
    counts.properties +
    counts.commercialAccounts +
    detail.walkthroughs.length +
    detail.proposals.length +
    detail.serviceAgreements.length +
    detail.invoices.length +
    detail.jobs.length;
  const timeline = buildTimeline(detail, t);

  return (
    <div className="space-y-6">
      <PageHeader
        title={relationship.displayName}
        description={t("guidance.owner.clientDetail")}
        back={{ href: "/clients", label: t("navigation.backToClients") }}
        action={
          <div className="flex flex-wrap gap-2">
            {canManageSales && (
              <button type="button" onClick={() => setShowLeadForm((current) => !current)} className="btn-primary flex items-center gap-2">
                <Plus className="h-4 w-4" />
                {t("clientRelationships.createLead")}
              </button>
            )}
            <button type="button" onClick={handleInviteClient} disabled={inviting || !relationship.email} className="btn-secondary text-sm">
              {inviting ? t("common.saving") : t("clientRelationships.inviteClient")}
            </button>
          </div>
        }
      />

      {canManageSales && showLeadForm && (
        <form onSubmit={handleCreateLead} className="card space-y-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{t("clientRelationships.createLead")}</h2>
            <p className="mt-1 text-sm text-gray-500">{t("clientRelationships.createLeadHelper")}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("clientRelationships.fields.primaryContactName")}>
              <input className="input-field mt-1" value={leadForm.requesterName} onChange={(event) => setLeadForm({ ...leadForm, requesterName: event.target.value })} required />
            </Field>
            <Field label={t("clientRelationships.fields.email")}>
              <input type="email" className="input-field mt-1" value={leadForm.requesterEmail} onChange={(event) => setLeadForm({ ...leadForm, requesterEmail: event.target.value })} required />
            </Field>
            <Field label={t("clientRelationships.fields.phone")}>
              <input className="input-field mt-1" value={leadForm.requesterPhone} onChange={(event) => setLeadForm({ ...leadForm, requesterPhone: event.target.value })} />
            </Field>
            <Field label={t("clientRelationships.fields.businessName")}>
              <input className="input-field mt-1" value={leadForm.businessName} onChange={(event) => setLeadForm({ ...leadForm, businessName: event.target.value })} />
            </Field>
            <Field label={t("common.notes")}>
              <textarea className="input-field mt-1" rows={3} value={leadForm.notes} onChange={(event) => setLeadForm({ ...leadForm, notes: event.target.value })} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={creatingLead} className="btn-primary flex items-center gap-2 text-sm">
              <Plus className="h-4 w-4" />
              {creatingLead ? t("common.saving") : t("clientRelationships.createLead")}
            </button>
            <button type="button" onClick={() => setShowLeadForm(false)} className="btn-secondary text-sm">
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}

      <section className="card space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{t("clientRelationships.clientAccess")}</h2>
            <p className="text-sm text-gray-500">
              {t(`clientRelationships.inviteStatuses.${relationship.inviteStatus}`)}
              {relationship.inviteSentAt ? ` · ${formatDate(relationship.inviteSentAt, "")}` : ""}
            </p>
          </div>
          {!relationship.email && (
            <span className="text-sm text-amber-700">{t("clientRelationships.inviteNeedsEmail")}</span>
          )}
        </div>
        {inviteLink && (
          <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
            <p className="mb-2 text-xs font-medium text-gray-500">{t("clientRelationships.inviteLink")}</p>
            <input className="input-field text-sm" value={inviteLink} readOnly />
          </div>
        )}
      </section>

      {totalLinkedRecords === 0 && (
        <div className="rounded-lg border border-primary-200 bg-primary-50 p-4 text-sm text-primary-800">
          {t("clientRelationships.empty.ready")}
        </div>
      )}

      <section className="card space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900">{relationship.displayName}</h2>
              <span className="badge bg-gray-100 text-gray-700 capitalize">
                {t(`clientRelationships.clientTypes.${relationship.clientType}`)}
              </span>
              <span className="badge bg-primary-50 text-primary-700 capitalize">
                {t(`clientRelationships.statuses.${relationship.status}`)}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {relationship.businessName || t("clientRelationships.noBusinessName")}
            </p>
          </div>
          <button type="button" onClick={() => setEditing((current) => !current)} className="btn-secondary text-sm">
            {editing ? t("common.cancel") : t("common.edit")}
          </button>
        </div>

        {editing ? (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t("clientRelationships.fields.displayName")}>
                <input className="input-field mt-1" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} required />
              </Field>
              <Field label={t("clientRelationships.fields.clientType")}>
                <select className="input-field mt-1 capitalize" value={form.clientType} onChange={(event) => setForm({ ...form, clientType: event.target.value as ClientType })}>
                  {CLIENT_TYPES.map((type) => (
                    <option key={type} value={type}>{t(`clientRelationships.clientTypes.${type}`)}</option>
                  ))}
                </select>
              </Field>
              <Field label={t("clientRelationships.fields.businessName")}>
                <input className="input-field mt-1" value={form.businessName} onChange={(event) => setForm({ ...form, businessName: event.target.value })} />
              </Field>
              <Field label={t("clientRelationships.fields.primaryContactName")}>
                <input className="input-field mt-1" value={form.primaryContactName} onChange={(event) => setForm({ ...form, primaryContactName: event.target.value })} />
              </Field>
              <Field label={t("clientRelationships.fields.email")}>
                <input type="email" className="input-field mt-1" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
              </Field>
              <Field label={t("clientRelationships.fields.phone")}>
                <input className="input-field mt-1" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
              </Field>
              <Field label={t("clientRelationships.fields.notes")}>
                <textarea className="input-field mt-1" rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
              </Field>
              <Field label={t("clientRelationships.fields.status")}>
                <select className="input-field mt-1 capitalize" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as RelationshipStatus })}>
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>{t(`clientRelationships.statuses.${status}`)}</option>
                  ))}
                </select>
              </Field>
            </div>
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2 text-sm">
              <Save className="h-4 w-4" />
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </form>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Detail icon={User} label={t("clientRelationships.fields.primaryContactName")} value={relationship.primaryContactName || notSet} />
            <Detail icon={Mail} label={t("clientRelationships.fields.email")} value={relationship.email || notSet} />
            <Detail icon={Phone} label={t("clientRelationships.fields.phone")} value={relationship.phone || notSet} />
            <Detail label={t("clientRelationships.clientUser")} value={relationship.hasClientUser ? t("clientRelationships.yes") : t("clientRelationships.no")} />
            <div className="rounded-lg border border-gray-200 p-3 sm:col-span-2 lg:col-span-4">
              <p className="text-xs font-medium text-gray-500">{t("clientRelationships.fields.notes")}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-900">{relationship.notes || notSet}</p>
            </div>
          </div>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <SummaryCard label={t("clientRelationships.summary.leads")} value={counts.leads} />
        <SummaryCard label={t("clientRelationships.summary.properties")} value={counts.properties} />
        <SummaryCard label={t("clientRelationships.summary.commercialAccounts")} value={counts.commercialAccounts} />
        <SummaryCard label={t("clientRelationships.summary.openInvoices")} value={counts.openInvoices} />
        <SummaryCard label={t("clientRelationships.summary.upcomingJobs")} value={counts.upcomingJobs} />
        <SummaryCard label={t("clientRelationships.summary.completedJobs")} value={counts.completedJobs} />
      </div>

      <section className="card space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-500" />
          <h2 className="text-base font-semibold text-gray-900">{t("clientRelationships.timeline.title")}</h2>
        </div>
        {timeline.length === 0 ? (
          <p className="text-sm text-gray-500">{t("clientRelationships.timeline.empty")}</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {timeline.map((event, index) => (
              <div key={`${event.at}-${event.label}-${index}`} className="flex gap-3 py-3 text-sm">
                <div className="mt-1 h-2 w-2 rounded-full bg-primary-500" />
                <div>
                  <p className="font-medium text-gray-900">{event.label}</p>
                  {event.sublabel && <p className="text-xs text-gray-500">{event.sublabel}</p>}
                  <p className="text-xs text-gray-400">{dateTimeLabel(event.at, notSet)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <RelatedSection title={t("clientRelationships.sections.leads")} empty={t("clientRelationships.empty.leads")} count={detail.leads.length}>
          <div className="divide-y divide-gray-100">
            {detail.leads.map((lead: any) => (
              <Link key={lead._id} href={`/requests/${lead._id}`} className="flex items-center justify-between gap-3 py-3 text-sm hover:text-primary-700">
                <span className="font-medium text-gray-900">{lead.businessName || lead.requesterName}</span>
                <span className="badge bg-gray-100 text-gray-700 capitalize">{label(lead.leadStage || lead.status)}</span>
              </Link>
            ))}
          </div>
        </RelatedSection>

        <RelatedSection
          title={t("clientRelationships.sections.properties")}
          empty={t("clientRelationships.empty.properties")}
          count={detail.properties.length}
          action={
            <Link
              href={`/properties/new?clientRelationshipId=${encodeURIComponent(relationship._id)}`}
              className="btn-secondary flex items-center gap-1.5 px-2 py-1 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("clientRelationships.addProperty")}
            </Link>
          }
        >
          <p className="pb-2 text-xs text-gray-500">{t("clientRelationships.propertiesHelper")}</p>
          <div className="divide-y divide-gray-100">
            {detail.properties.map((property: any) => (
              <Link key={property._id} href={`/properties/${property._id}`} className="flex items-center gap-3 py-3 text-sm hover:text-primary-700">
                <Home className="h-4 w-4 text-gray-400" />
                <span>
                  <span className="block font-medium text-gray-900">{property.name}</span>
                  <span className="text-xs text-gray-500">{property.address}</span>
                </span>
              </Link>
            ))}
          </div>
        </RelatedSection>

        <RelatedSection title={t("clientRelationships.sections.commercialAccounts")} empty={t("clientRelationships.empty.commercialAccounts")} count={detail.commercialAccounts.length}>
          <div className="divide-y divide-gray-100">
            {detail.commercialAccounts.map((account: any) => (
              <Link key={account._id} href={`/commercial-accounts/${account._id}`} className="flex items-center justify-between gap-3 py-3 text-sm hover:text-primary-700">
                <span>
                  <span className="block font-medium text-gray-900">{account.clientName}</span>
                  <span className="text-xs text-gray-500">{account.serviceAddress || notSet}</span>
                </span>
                <span className="badge bg-gray-100 text-gray-700 capitalize">{t(`commercialAccounts.statuses.${account.status}`)}</span>
              </Link>
            ))}
          </div>
        </RelatedSection>

        <RelatedSection title={t("clientRelationships.sections.walkthroughs")} empty={t("clientRelationships.empty.walkthroughs")} count={detail.walkthroughs.length}>
          <div className="divide-y divide-gray-100">
            {detail.walkthroughs.map((walkthrough: any) => (
              <div key={walkthrough._id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="font-medium text-gray-900">{walkthrough.title}</span>
                <span className="badge bg-gray-100 text-gray-700 capitalize">{t(`walkthroughs.statuses.${walkthrough.status}`)}</span>
              </div>
            ))}
          </div>
        </RelatedSection>

        <RelatedSection title={t("clientRelationships.sections.proposals")} empty={t("clientRelationships.empty.proposals")} count={detail.proposals.length}>
          <div className="divide-y divide-gray-100">
            {detail.proposals.map((proposal: any) => (
              <Link key={proposal._id} href={`/requests/${proposal.clientRequestId}`} className="flex items-center justify-between gap-3 py-3 text-sm hover:text-primary-700">
                <span>
                  <span className="block font-medium text-gray-900">{proposal.title}</span>
                  <span className="text-xs text-gray-500">{formatCents(proposal.monthlyPriceCents ?? proposal.oneTimePriceCents, notSet)}</span>
                </span>
                <span className="badge bg-gray-100 text-gray-700 capitalize">{t(`proposals.statuses.${proposal.status}`)}</span>
              </Link>
            ))}
          </div>
        </RelatedSection>

        <RelatedSection title={t("clientRelationships.sections.serviceAgreements")} empty={t("clientRelationships.empty.serviceAgreements")} count={detail.serviceAgreements.length}>
          <div className="divide-y divide-gray-100">
            {detail.serviceAgreements.map((agreement: any) => (
              <div key={agreement._id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span>
                  <span className="block font-medium text-gray-900">{agreement.title}</span>
                  <span className="text-xs text-gray-500">{formatCents(agreement.contractAmountCents, notSet)}</span>
                </span>
                <ServiceAgreementStatusBadge agreement={agreement} />
              </div>
            ))}
          </div>
        </RelatedSection>

        <RelatedSection title={t("clientRelationships.sections.invoices")} empty={t("clientRelationships.empty.invoices")} count={detail.invoices.length}>
          <div className="divide-y divide-gray-100">
            {detail.invoices.map((invoice: any) => (
              <Link key={invoice._id} href={`/commercial-invoices/${invoice._id}`} className="flex items-center justify-between gap-3 py-3 text-sm hover:text-primary-700">
                <span>
                  <span className="block font-medium text-gray-900">{invoice.invoiceNumber}</span>
                  <span className="text-xs text-gray-500">{formatCents(invoice.totalCents, notSet)}</span>
                </span>
                <span className="badge bg-gray-100 text-gray-700 capitalize">{t(`invoices.statuses.${invoice.status}`)}</span>
              </Link>
            ))}
          </div>
        </RelatedSection>

        <RelatedSection title={t("clientRelationships.sections.jobs")} empty={t("clientRelationships.empty.jobs")} count={detail.jobs.length}>
          <div className="divide-y divide-gray-100">
            {detail.jobs.map((job: any) => (
              <Link key={job._id} href={`/jobs/${job._id}`} className="flex items-center justify-between gap-3 py-3 text-sm hover:text-primary-700">
                <span className="flex items-center gap-2 font-medium text-gray-900">
                  <Wrench className="h-4 w-4 text-gray-400" />
                  {formatDate(job.scheduledDate, notSet)}
                </span>
                <span className="badge bg-gray-100 text-gray-700 capitalize">{label(job.status)}</span>
              </Link>
            ))}
          </div>
        </RelatedSection>
      </div>

    </div>
  );
}
