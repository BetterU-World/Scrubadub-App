import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { getStaffSessionToken, useAuth } from "@/hooks/useAuth";
import { jobBillingView } from "../../lib/invoiceWorkflowPresentation";

function defaultPeriod(date: string) {
  const month = /^\d{4}-\d{2}/.exec(date)?.[0];
  if (!month) return { start: date, end: date };
  const [year, number] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
}

export function JobInvoiceBillingPanel({ job }: { job: { _id: Id<"jobs">; commercialAccountId?: Id<"commercialAccounts">; scheduledDate: string; status: string } }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const canManage = user?.role === "owner" || user?.canManageInvoices === true;
  const canRead = canManage || user?.canViewFinancials === true;
  const billing = useQuery(
    api.queries.invoices.getBillingForJob,
    job.commercialAccountId && canRead && user ? { userId: user._id, sessionToken: getStaffSessionToken(), jobId: job._id } : "skip",
  );
  const generate = useMutation(api.mutations.invoices.generateFromJobs);
  const [reviewing, setReviewing] = useState(false);
  const [start, setStart] = useState(() => defaultPeriod(job.scheduledDate).start);
  const [end, setEnd] = useState(() => defaultPeriod(job.scheduledDate).end);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [periodDraftId, setPeriodDraftId] = useState<Id<"invoices"> | null>(null);

  if (!job.commercialAccountId || !canRead) return null;
  if (billing === undefined || !billing || billing.kind !== "commercial") return null;

  const existing = billing.existingInvoice;
  const view = jobBillingView({ commercialAccountId: job.commercialAccountId, jobStatus: billing.jobStatus, hasInvoice: !!existing, canRead, canManage });
  const createDraft = async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const result = await generate({ userId: user._id, sessionToken: getStaffSessionToken(), commercialAccountId: billing.commercialAccountId, billingStartDate: start, billingEndDate: end });
      if (result.existingInvoice && result.invoiceId) {
        setPeriodDraftId(result.invoiceId);
        setError(t("jobBilling.existingPeriodDraft"));
      } else if (result.invoiceId) navigate(`/commercial-invoices/${result.invoiceId}`);
      else setError(t("jobBilling.noEligible"));
    } catch (e: any) {
      setError(e.message ?? t("invoices.createFailed"));
    } finally {
      setBusy(false);
    }
  };

  return <section className="card space-y-3" aria-label={t("jobBilling.title")}>
    <h2 className="text-lg font-semibold text-gray-900">{t("jobBilling.title")}</h2>
    {view === "existing" && existing ? <>
      <p className="text-sm text-gray-600">{t("jobBilling.existing", { number: existing.invoiceNumber, status: t(`invoices.statuses.${existing.status}`) })}</p>
      <Link href={`/commercial-invoices/${existing._id}`} className="btn-secondary inline-flex text-sm">{t("jobBilling.view")}</Link>
    </> : view === "awaiting_approval" ?
      <p className="text-sm text-gray-600">{t("jobBilling.awaitingApproval")}</p> : !canManage ?
      <p className="text-sm text-gray-600">{t("jobBilling.notInvoiced")}</p> : <>
        <p className="text-sm font-medium text-gray-800">{t("jobBilling.notInvoiced")}</p>
        <p className="text-sm text-gray-600">{t("jobBilling.explanation")}</p>
        {!reviewing ? <button type="button" className="btn-primary text-sm" onClick={() => setReviewing(true)}>{t("jobBilling.review")}</button> : <div className="space-y-3 rounded-lg border p-3">
          <p className="text-sm text-gray-600">{t("jobBilling.periodExplanation")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">{t("invoices.billingStart")}<input className="input-field mt-1" type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
            <label className="text-sm">{t("invoices.billingEnd")}<input className="input-field mt-1" type="date" value={end} onChange={e => setEnd(e.target.value)} /></label>
          </div>
          <button type="button" className="btn-primary text-sm" disabled={busy || !start || !end} onClick={createDraft}>{busy ? t("common.saving") : t("jobBilling.generateDraft")}</button>
        </div>}
      </>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {periodDraftId && <Link href={`/commercial-invoices/${periodDraftId}`} className="text-sm font-medium text-primary-700">{t("jobBilling.viewPeriodDraft")}</Link>}
  </section>;
}
