import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { FileText, Plus, Receipt } from "lucide-react";
import { useTranslation } from "react-i18next";

type Props = {
  commercialAccountId: Id<"commercialAccounts">;
  onToast?: (message: string, type: "success" | "error") => void;
};

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

export function CommercialInvoiceCard({ commercialAccountId, onToast }: Props) {
  const { user, sessionToken } = useAuth();
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [billingStartDate, setBillingStartDate] = useState("");
  const [billingEndDate, setBillingEndDate] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{
    included: number;
    skipped: number;
  } | null>(null);

  const invoices = useQuery(
    (api as any).queries.invoices.listByCommercialAccount,
    user && sessionToken ? { userId: user._id, sessionToken, commercialAccountId } : "skip"
  );
  const generateInvoice = useMutation((api as any).mutations.invoices.generateFromJobs);

  const showToast = (message: string, type: "success" | "error") => {
    onToast?.(message, type);
  };

  const handleGenerate = async () => {
    if (!user) return;
    if (!billingStartDate || !billingEndDate) {
      showToast(t("invoices.selectBillingDates"), "error");
      return;
    }
    setGenerating(true);
    try {
      const response = await generateInvoice({
        userId: user._id,
        sessionToken,
        commercialAccountId,
        billingStartDate,
        billingEndDate,
      });
      setResult({
        included: response.jobsIncluded.length,
        skipped: response.jobsSkipped.length,
      });
      showToast(
        response.existingInvoice
          ? t("invoices.existingDraftOpened")
          : response.invoiceId
            ? t("invoices.created")
            : t("invoices.noEligibleJobs"),
        response.invoiceId ? "success" : "error"
      );
      if (response.invoiceId) {
        navigate(`/commercial-invoices/${response.invoiceId}`);
      }
    } catch (err: any) {
      showToast(err.message || t("invoices.createFailed"), "error");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section className="card">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-gray-400" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{t("invoices.title")}</h2>
            <p className="text-sm text-gray-500">{t("invoices.helper")}</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label>
            <span className="text-xs font-medium text-gray-600">{t("invoices.billingStart")}</span>
            <input
              type="date"
              className="input-field mt-1 text-sm"
              value={billingStartDate}
              onChange={(e) => setBillingStartDate(e.target.value)}
            />
          </label>
          <label>
            <span className="text-xs font-medium text-gray-600">{t("invoices.billingEnd")}</span>
            <input
              type="date"
              className="input-field mt-1 text-sm"
              value={billingEndDate}
              onChange={(e) => setBillingEndDate(e.target.value)}
            />
          </label>
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="btn-primary mt-3 flex items-center gap-2 text-sm"
        >
          <Plus className="h-4 w-4" />
          {generating
            ? t("common.saving")
            : invoices && invoices.length > 0
              ? t("invoices.generateNew")
              : t("invoices.generateFirst")}
        </button>
        {result && (
          <p className="mt-2 text-xs text-gray-500">
            {t("invoices.generationResult", {
              included: result.included,
              skipped: result.skipped,
            })}
          </p>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {invoices === undefined ? null : invoices.length === 0 ? (
          <p className="text-sm text-gray-500">{t("invoices.none")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full min-w-[680px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                    {t("invoices.invoiceNumber")}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                    {t("invoices.billingPeriod")}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                    {t("commercialAccounts.status")}
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">
                    {t("invoices.total")}
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">
                    {t("invoices.actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice: any) => (
                  <tr key={invoice._id} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-gray-400" />
                        <span className="font-medium text-gray-900">{invoice.invoiceNumber}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-600">
                      {formatDate(invoice.billingStartDate)} - {formatDate(invoice.billingEndDate)}
                    </td>
                    <td className="px-3 py-3">
                      <span className="badge bg-gray-100 text-gray-700">
                        {t(`invoices.statuses.${invoice.status}`)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-sm font-semibold text-gray-900">
                      {formatCents(invoice.totalCents)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Link
                        href={`/commercial-invoices/${invoice._id}`}
                        className="text-sm font-medium text-primary-600 hover:text-primary-700"
                      >
                        {t("invoices.view")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
