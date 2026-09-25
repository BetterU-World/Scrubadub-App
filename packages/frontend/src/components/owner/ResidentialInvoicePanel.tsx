import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";

export function ResidentialInvoicePanel({ jobId }: { jobId: Id<"jobs"> }) {
  const { t } = useTranslation();
  const { user, sessionToken } = useAuth();
  const [, navigate] = useLocation();
  const canRead = user?.role === "owner" || user?.canManageInvoices || user?.canViewFinancials;
  const state = useQuery(api.queries.invoices.getForResidentialJob, canRead && user && sessionToken ? { userId: user._id, sessionToken, jobId } : "skip");
  const create = useMutation(api.mutations.invoices.createFromJob);
  const [term, setTerm] = useState("30");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!canRead || !state || state.kind !== "job") return null;
  const dueDays = Number(term);
  const createDraft = async () => {
    if (!user) return;
    setBusy(true); setError("");
    try {
      if (!Number.isSafeInteger(dueDays) || dueDays < 0 || dueDays > 365) throw new Error(t("invoices.invalidDueDays"));
      const invoiceId = await create({ userId: user._id, sessionToken, jobId, paymentDueDays: dueDays });
      navigate(`/invoices/${invoiceId}`);
    } catch (e: any) { setError(e.message ?? t("invoices.createFailed")); }
    finally { setBusy(false); }
  };
  return <section className="card space-y-3" aria-label={t("invoices.jobBillingTitle")}>
    <h2 className="text-lg font-semibold">{t("invoices.jobBillingTitle")}</h2>
    {state.activeInvoice ? <p>{t("invoices.existingJobInvoice", { number: state.activeInvoice.invoiceNumber, status: t(`invoices.statuses.${state.activeInvoice.status}`) })} <Link className="text-primary-700 underline" href={`/invoices/${state.activeInvoice._id}`}>{t("invoices.viewInvoice")}</Link></p> : <>
      <p>{state.readiness.ok ? t("invoices.readyForInvoicing") : t(`jobPricing.readiness.${state.readiness.reason}`)}</p>
      {state.readiness.ok && state.canManage && <div className="space-y-2">
        <label className="block text-sm">{t("invoices.paymentDueDays")}<select className="input-field mt-1" value={["0", "3", "7", "15", "30"].includes(term) ? term : "custom"} onChange={e => setTerm(e.target.value === "custom" ? "31" : e.target.value)}><option value="0">{t("invoices.dueImmediately")}</option>{[3, 7, 15, 30].map(days => <option key={days} value={days}>{t("invoices.daysAfterIssue", { count: days })}</option>)}<option value="custom">{t("invoices.customDueDays")}</option></select></label>
        {!["0", "3", "7", "15", "30"].includes(term) && <input className="input-field w-32" type="number" min="0" max="365" step="1" aria-label={t("invoices.customDueDays")} value={term} onChange={e => setTerm(e.target.value)} />}
        <button className="btn-primary" type="button" disabled={busy} onClick={createDraft}>{t(state.voidInvoices.length ? "invoices.createReplacementDraft" : "invoices.createJobDraft")}</button>
      </div>}
    </>}
    {state.voidInvoices.map(invoice => <p className="text-sm text-gray-600" key={invoice._id}>{invoice.invoiceNumber} · {t("invoices.statuses.void")} · <Link href={`/invoices/${invoice._id}`} className="underline">{t("invoices.viewInvoice")}</Link></p>)}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>;
}
