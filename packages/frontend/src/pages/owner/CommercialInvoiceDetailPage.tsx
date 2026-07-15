import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { Check, FileText, Receipt, Save, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

function formatCents(cents: number | undefined) {
  if (cents == null) return "$0.00";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatDate(date: string | undefined) {
  if (!date) return "";
  return new Date(`${date}T00:00:00`).toLocaleDateString();
}

function formatTimestamp(ts: number | undefined) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString();
}

export function CommercialInvoiceDetailPage() {
  const { user, sessionToken } = useAuth();
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const invoice = useQuery(
    (api as any).queries.invoices.getById,
    user && sessionToken && params.id
      ? { userId: user._id, sessionToken, invoiceId: params.id as Id<"invoices"> }
      : "skip"
  );
  const updateDraft = useMutation((api as any).mutations.invoices.updateDraft);
  const markIssued = useMutation((api as any).mutations.invoices.markIssued);
  const markPaid = useMutation((api as any).mutations.invoices.markPaid);
  const voidInvoice = useMutation((api as any).mutations.invoices.voidInvoice);

  useEffect(() => {
    if (invoice) setNotes(invoice.notes ?? "");
  }, [invoice?._id]);

  if (!user || invoice === undefined) return <PageLoader />;
  if (!invoice) {
    return <div className="py-12 text-center text-gray-500">{t("invoices.notFound")}</div>;
  }

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), type === "success" ? 2000 : 3000);
  };

  const handleSaveNotes = async () => {
    setSaving(true);
    try {
      await updateDraft({ userId: user._id, sessionToken, invoiceId: invoice._id, notes });
      showToast(t("invoices.saved"), "success");
    } catch (err: any) {
      showToast(err.message || t("invoices.saveFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleAction = async (action: "issued" | "paid" | "void") => {
    setActionLoading(action);
    try {
      if (action === "issued") {
        await markIssued({ userId: user._id, sessionToken, invoiceId: invoice._id });
      } else if (action === "paid") {
        await markPaid({ userId: user._id, sessionToken, invoiceId: invoice._id });
      } else {
        await voidInvoice({ userId: user._id, sessionToken, invoiceId: invoice._id });
      }
      showToast(t(`invoices.${action}Success`), "success");
    } catch (err: any) {
      showToast(err.message || t("invoices.actionFailed"), "error");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div>
      <PageHeader
        title={`${t("invoices.invoice")} ${invoice.invoiceNumber}`}
        description={invoice.title}
        back={{ href: "/commercial-invoices", label: t("navigation.backToCommercialInvoices") }}
        action={
          <span className="badge bg-gray-100 text-gray-700">
            {t(`invoices.statuses.${invoice.status}`)}
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <section className="card">
            <div className="mb-4 flex items-center gap-2">
              <Receipt className="h-5 w-5 text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900">{t("invoices.summary")}</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-gray-500">{t("invoices.invoiceNumber")}</p>
                <p className="mt-1 text-sm font-medium text-gray-900">{invoice.invoiceNumber}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">{t("invoices.commercialAccount")}</p>
                <Link
                  href={`/commercial-accounts/${invoice.commercialAccountId}`}
                  className="mt-1 block text-sm font-medium text-primary-600 hover:text-primary-700"
                >
                  {invoice.commercialAccountName ?? t("commercialAccounts.summary")}
                </Link>
              </div>
              {invoice.clientRelationship && (
                <div>
                  <p className="text-xs font-medium text-gray-500">{t("invoices.client")}</p>
                  <Link
                    href={`/clients/${invoice.clientRelationship._id}`}
                    className="mt-1 inline-flex rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100"
                  >
                    {invoice.clientRelationship.displayName}
                  </Link>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-gray-500">{t("invoices.billingPeriod")}</p>
                <p className="mt-1 text-sm text-gray-900">
                  {formatDate(invoice.billingStartDate)} - {formatDate(invoice.billingEndDate)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">{t("invoices.issueDue")}</p>
                <p className="mt-1 text-sm text-gray-900">
                  {formatDate(invoice.issueDate)} / {formatDate(invoice.dueDate)}
                </p>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900">{t("invoices.jobsIncluded")}</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {invoice.jobs.map((job: any) => (
                <Link
                  key={job._id}
                  href={`/jobs/${job._id}`}
                  className="flex items-center justify-between gap-3 py-3 text-sm hover:bg-gray-50"
                >
                  <span className="font-medium text-gray-900">{formatDate(job.scheduledDate)}</span>
                  <span className="text-gray-500">
                    {job.completedAt ? t("invoices.completedOn", { date: formatTimestamp(job.completedAt) }) : t("invoices.completed")}
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section className="card">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">{t("common.notes")}</h2>
            {invoice.status === "draft" ? (
              <div className="space-y-3">
                <textarea
                  className="input-field"
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
                <button
                  type="button"
                  onClick={handleSaveNotes}
                  disabled={saving}
                  className="btn-secondary flex items-center gap-2 text-sm"
                >
                  <Save className="h-4 w-4" />
                  {saving ? t("common.saving") : t("invoices.saveNotes")}
                </button>
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-sm text-gray-700">
                {invoice.notes || t("invoices.noNotes")}
              </p>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="card">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">{t("invoices.total")}</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">{t("invoices.subtotal")}</span>
                <span className="font-medium text-gray-900">{formatCents(invoice.subtotalCents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{t("invoices.tax")}</span>
                <span className="font-medium text-gray-900">{formatCents(invoice.taxCents)}</span>
              </div>
              <div className="border-t pt-3 flex justify-between text-base">
                <span className="font-semibold text-gray-900">{t("invoices.total")}</span>
                <span className="font-semibold text-gray-900">{formatCents(invoice.totalCents)}</span>
              </div>
            </div>
          </section>

          <section className="card space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">{t("invoices.actions")}</h2>
            {invoice.status === "draft" && (
              <button
                type="button"
                onClick={() => handleAction("issued")}
                disabled={actionLoading === "issued"}
                className="btn-primary flex w-full items-center justify-center gap-2 text-sm"
              >
                <FileText className="h-4 w-4" />
                {t("invoices.markIssued")}
              </button>
            )}
            {invoice.status === "issued" && (
              <button
                type="button"
                onClick={() => handleAction("paid")}
                disabled={actionLoading === "paid"}
                className="btn-primary flex w-full items-center justify-center gap-2 text-sm"
              >
                <Check className="h-4 w-4" />
                {t("invoices.markPaid")}
              </button>
            )}
            {(invoice.status === "draft" || invoice.status === "issued") && (
              <button
                type="button"
                onClick={() => handleAction("void")}
                disabled={actionLoading === "void"}
                className="btn-danger flex w-full items-center justify-center gap-2 text-sm"
              >
                <XCircle className="h-4 w-4" />
                {t("invoices.void")}
              </button>
            )}
            {invoice.status === "paid" && (
              <p className="text-sm text-gray-500">{t("invoices.paidInternalNote")}</p>
            )}
          </section>
        </aside>
      </div>

      {toast && (
        <div className={`fixed right-4 top-4 z-50 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${toast.type === "success" ? "bg-green-600" : "bg-red-600"}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
