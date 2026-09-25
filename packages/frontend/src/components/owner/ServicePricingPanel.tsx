import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";

const cents = (value: string) => /^\d+(?:\.\d{1,2})?$/.test(value.trim()) ? Math.round(Number(value) * 100) : null;
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);

export function ServicePricingPanel({ requestId, jobId, commercial = false }: { requestId?: string; jobId?: string; commercial?: boolean }) {
  const { t } = useTranslation();
  const { user, sessionToken } = useAuth();
  const allowed = user?.role === "owner" || (user?.role === "manager" && (user.canManageSalesAndCommercial || user.canViewFinancials));
  const requestData = useQuery((api as any).queries.servicePriceOffers.forRequest, allowed && requestId ? { userId: user?._id, sessionToken, requestId } : "skip");
  const jobData = useQuery((api as any).queries.servicePriceOffers.forJob, allowed && jobId ? { userId: user?._id, sessionToken, jobId } : "skip");
  const issue = useMutation((api as any).mutations.servicePriceOffers.issue);
  const recordOutside = useMutation((api as any).mutations.servicePriceOffers.recordOutsideAcceptance);
  const markNoCharge = useMutation((api as any).mutations.servicePriceOffers.markNoCharge);
  const confirmAddOns = useMutation((api as any).mutations.servicePriceOffers.confirmDeliveredAddOns);
  const [amount, setAmount] = useState("");
  const [addOns, setAddOns] = useState<Array<{ name: string; amount: string }>>([]);
  const [evidence, setEvidence] = useState("");
  const [reason, setReason] = useState<"complimentary" | "waived" | "discounted_to_zero">("complimentary");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!allowed || commercial) return null;
  const data = requestId ? requestData : jobData;
  if (!data) return null;
  const offer = data.offer;
  const status = jobId ? jobData?.status : offer?.status === "accepted" ? "accepted" : offer?.status === "issued" ? "awaiting_acceptance" : "pending";
  const canManage = data.canManage;
  const revision = jobId ? jobData?.revision ?? 0 : offer?.version ?? 0;
  const act = async (operation: () => Promise<unknown>) => { setBusy(true); setError(""); try { await operation(); setAmount(""); setAddOns([]); setEvidence(""); } catch (e: any) { setError(e.message || t("jobPricing.failed")); } finally { setBusy(false); } };
  return <section className="card space-y-3" aria-label={t("jobPricing.title")}>
    <h2 className="font-semibold text-gray-900">{t("jobPricing.title")}</h2>
    <p className="text-sm text-gray-700">{t(`jobPricing.states.${status}`)}{jobData?.source ? ` · ${t(`jobPricing.sources.${jobData.source}`)}` : ""}</p>
    {jobData?.status === "legacy_unverified" && <p className="text-sm text-amber-800">{t("jobPricing.legacy")}</p>}
    {jobData?.chargeCents !== undefined && <p className="text-sm font-medium">{money(jobData.chargeCents)}</p>}
    {offer && <div className="rounded-lg border border-gray-200 p-3 text-sm"><p>{t("jobPricing.offerVersion", { version: offer.version })} · {money(offer.snapshot.totalCents)} · {t(`jobPricing.offerStates.${offer.status}`)}</p>{offer.snapshot.addOns.map((line: any) => <p key={line.snapshotId}>{line.name}: {money(line.amountCents)}</p>)}</div>}
    {requestId && offer?.status === "accepted" && <p className="text-sm text-gray-600">{t(`jobPricing.consent.${offer.acceptedByClientUserId ? "client_in_app" : "owner_reported_outside"}`)}{offer.outsideEvidenceNote ? ` · ${offer.outsideEvidenceNote}` : ""}</p>}
    {jobData?.consent && <p className="text-sm text-gray-600">{t(`jobPricing.consent.${jobData.consent.source}`)} · {new Date(jobData.consent.acceptedAt).toLocaleDateString()}</p>}
    {jobData?.noChargeReason && <p className="text-sm text-gray-600">{t(`jobPricing.reasons.${jobData.noChargeReason}`)}</p>}
    {jobData?.snapshot?.addOns?.map((line: any) => <p className="text-sm text-gray-600" key={line.snapshotId}>{line.name}: {money(line.amountCents)}</p>)}
    {jobData && <p className="text-sm text-gray-600">{jobData.readiness.ok ? t("jobPricing.invoiceReady") : t(`jobPricing.readiness.${jobData.readiness.reason}`)}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {canManage && <div className="space-y-3 border-t border-gray-200 pt-3">
      {jobId && jobData?.readiness?.reason === "add_ons_unconfirmed" && <button type="button" className="btn-secondary text-sm" disabled={busy} onClick={() => act(() => confirmAddOns({ userId: user!._id, sessionToken, jobId, expectedRevision: revision }))}>{t("jobPricing.confirmAddOns")}</button>}
      <p className="text-sm font-medium">{offer || jobData?.status === "accepted" ? t("jobPricing.revise") : t("jobPricing.createOffer")}</p>
      <label className="block text-sm">{t("jobPricing.baseAmount")}<input className="input-field mt-1 w-full" type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
      {addOns.map((line, index) => <div className="grid grid-cols-[1fr_7rem_auto] gap-2" key={index}><input className="input-field" aria-label={t("jobPricing.addOnName")} placeholder={t("jobPricing.addOnName")} value={line.name} onChange={(event) => setAddOns((all) => all.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} /><input className="input-field" aria-label={t("jobPricing.addOnAmount")} type="number" min="0" step="0.01" value={line.amount} onChange={(event) => setAddOns((all) => all.map((item, i) => i === index ? { ...item, amount: event.target.value } : item))} /><button type="button" className="btn-secondary" onClick={() => setAddOns((all) => all.filter((_, i) => i !== index))}>{t("jobPricing.remove")}</button></div>)}
      <button type="button" className="btn-secondary text-sm" onClick={() => setAddOns((all) => [...all, { name: "", amount: "" }])}>{t("jobPricing.addAddOn")}</button>
      <p className="text-xs text-gray-600">{t("jobPricing.consentNotice")}</p>
      <button type="button" className="btn-primary text-sm" disabled={busy} onClick={() => act(async () => { const base = cents(amount); const lines = addOns.map((line) => ({ name: line.name.trim(), amountCents: cents(line.amount) })); if (base === null || lines.some((line) => !line.name || line.amountCents === null)) throw new Error(t("jobPricing.invalidAmount")); await issue({ userId: user!._id, sessionToken, requestId, jobId, expectedRevision: revision, baseChargeCents: base, addOns: lines }); })}>{t("jobPricing.issueOffer")}</button>
      {offer?.status === "issued" && <div className="space-y-2"><label className="block text-sm">{t("jobPricing.outsideEvidence")}<textarea className="input-field mt-1 w-full" value={evidence} onChange={(event) => setEvidence(event.target.value)} maxLength={500} /></label><button type="button" className="btn-secondary text-sm" disabled={busy || evidence.trim().length < 5} onClick={() => act(() => recordOutside({ userId: user!._id, sessionToken, offerId: offer._id, expectedRevision: offer.version, evidenceNote: evidence }))}>{t("jobPricing.recordOutside")}</button></div>}
      {jobId && <div className="flex flex-wrap gap-2"><select className="input-field" aria-label={t("jobPricing.noChargeReason")} value={reason} onChange={(event) => setReason(event.target.value as typeof reason)}><option value="complimentary">{t("jobPricing.reasons.complimentary")}</option><option value="waived">{t("jobPricing.reasons.waived")}</option><option value="discounted_to_zero">{t("jobPricing.reasons.discounted_to_zero")}</option></select><button type="button" className="btn-secondary text-sm" disabled={busy} onClick={() => act(() => markNoCharge({ userId: user!._id, sessionToken, jobId, expectedRevision: revision, reason }))}>{t("jobPricing.markNoCharge")}</button></div>}
    </div>}
  </section>;
}
