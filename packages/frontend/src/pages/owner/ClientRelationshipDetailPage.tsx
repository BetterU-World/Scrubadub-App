import { FormEvent, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useParams } from "wouter";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { ArrowLeft, Home, Mail, Phone, Save, User, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";

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
  status: "active" as RelationshipStatus,
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
}: {
  title: string;
  empty: string;
  children: ReactNode;
  count: number;
}) {
  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <span className="badge bg-gray-100 text-gray-700">{count}</span>
      </div>
      {count === 0 ? <p className="text-sm text-gray-500">{empty}</p> : children}
    </section>
  );
}

export function ClientRelationshipDetailPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const detail = useQuery(
    (api as any).queries.clientRelationships.getClientRelationshipDetail,
    user && params.id
      ? { userId: user._id, relationshipId: params.id as Id<"clientRelationships"> }
      : "skip"
  );
  const updateRelationship = useMutation((api as any).mutations.clientRelationships.update);

  const relationship = detail?.relationship;
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
      status: relationship.status ?? "active",
    });
  }, [relationship?._id]);

  if (!user || detail === undefined) return <PageLoader />;
  if (!detail || !relationship) {
    return <div className="py-12 text-center text-gray-500">{t("clientRelationships.notFound")}</div>;
  }

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), type === "success" ? 2000 : 3000);
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await updateRelationship({
        userId: user._id,
        relationshipId: relationship._id,
        displayName: form.displayName,
        clientType: form.clientType,
        businessName: form.businessName || undefined,
        primaryContactName: form.primaryContactName || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
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

  return (
    <div className="space-y-6">
      <PageHeader
        title={relationship.displayName}
        description={t("clientRelationships.detailDescription")}
        action={
          <Link href="/clients" className="btn-secondary flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            {t("clientRelationships.backToClients")}
          </Link>
        }
      />

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

        <RelatedSection title={t("clientRelationships.sections.properties")} empty={t("clientRelationships.empty.properties")} count={detail.properties.length}>
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
                <span className="badge bg-gray-100 text-gray-700 capitalize">{t(`serviceAgreements.statuses.${agreement.status}`)}</span>
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

      {toast && (
        <div className={`fixed right-4 top-4 z-50 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${toast.type === "success" ? "bg-green-600" : "bg-red-600"}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
