import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { ClientPortalPage, ClientPortalSection, formatClientMoney } from "@/components/client/ClientPortalPage";
import { useClientAuth } from "@/hooks/useClientAuth";

type AddOnSelection = { selectionVersion: string; quantity?: number };

export function ClientRequestNewPage() {
  const { t } = useTranslation(); const [, navigate] = useLocation(); const { clientUserId, sessionToken } = useClientAuth();
  const options = useQuery((api as any).queries.clientPortal.getClientRequestOptions, clientUserId && sessionToken ? { clientUserId, sessionToken } : "skip");
  const createRequest = useMutation((api as any).mutations.clientRequests.createAuthenticatedClientRequest);
  const [relationshipId, setRelationshipId] = useState(""); const [locationKey, setLocationKey] = useState("");
  const [service, setService] = useState(""); const [date, setDate] = useState(""); const [timeWindow, setTimeWindow] = useState("");
  const [notes, setNotes] = useState(""); const [addOns, setAddOns] = useState<Record<string, AddOnSelection>>({});
  const [reviewing, setReviewing] = useState(false); const [submitting, setSubmitting] = useState(false); const [errors, setErrors] = useState<string[]>([]);
  const [idempotencyKey] = useState(() => crypto.randomUUID().replace(/-/g, "")); const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (options?.providers.length === 1 && !relationshipId) setRelationshipId(options.providers[0]._id); }, [options, relationshipId]);
  const provider = options?.providers.find((item: any) => item._id === relationshipId);
  const location = provider?.locations.find((item: any) => `${item.type}:${item.id}` === locationKey);
  const availableAddOns = provider?.addOns ?? [];
  const selectedAddOns = useMemo(() => availableAddOns.filter((item: any) => addOns[item.id]), [availableAddOns, addOns]);
  const minDate = new Date().toLocaleDateString("en-CA");

  const validate = () => {
    const next: string[] = [];
    if (!relationshipId) next.push(t("clientRequests.validation.provider"));
    if (!locationKey) next.push(t("clientRequests.validation.location"));
    if (!service) next.push(t("clientRequests.validation.service"));
    if (!date) next.push(t("clientRequests.validation.date")); else if (date < minDate) next.push(t("clientRequests.validation.datePast"));
    if (!timeWindow) next.push(t("clientRequests.validation.time"));
    if (notes.length > 2000) next.push(t("clientRequests.validation.notes"));
    for (const item of selectedAddOns) if (item.pricingMethod === "per_unit" && (!addOns[item.id].quantity || addOns[item.id].quantity! < 1)) next.push(t("clientRequests.validation.quantity", { name: item.name }));
    setErrors(next); if (next.length) setTimeout(() => errorRef.current?.focus(), 0); return next.length === 0;
  };
  const review = (event: FormEvent) => { event.preventDefault(); if (validate()) { setReviewing(true); window.scrollTo({ top: 0, behavior: "smooth" }); } };
  const submit = async () => {
    if (!clientUserId || !sessionToken || !provider || !location || submitting) return;
    setSubmitting(true); setErrors([]);
    try {
      const result = await createRequest({ clientUserId, sessionToken, clientRelationshipId: provider._id, location: { type: location.type, id: location.id }, requestedService: service, requestedDate: date, timeWindow, notes: notes.trim() || undefined, requestedAddOns: selectedAddOns.map((item: any) => ({ companyAddOnId: item.id, ...addOns[item.id] })), idempotencyKey });
      navigate(`/client/requests/${result.requestId}?submitted=1`);
    } catch (error: any) {
      setErrors([error?.message || t("clientRequests.validation.submitFailed")]); setSubmitting(false); setTimeout(() => errorRef.current?.focus(), 0);
    }
  };
  const changeProvider = (value: string) => { setRelationshipId(value); setLocationKey(""); setAddOns({}); };
  const toggleAddOn = (item: any, checked: boolean) => setAddOns((current) => { const next = { ...current }; if (checked) next[item.id] = { selectionVersion: item.selectionVersion, ...(item.pricingMethod === "per_unit" ? { quantity: 1 } : {}) }; else delete next[item.id]; return next; });

  return <ClientPortalPage title={t("clientRequests.newTitle")} description={t("clientRequests.newDescription")} data={options}>
    {errors.length > 0 && <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p className="font-semibold">{t("clientRequests.validation.summary")}</p><ul className="mt-2 list-disc space-y-1 pl-5">{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
    {!reviewing ? <form onSubmit={review} className="space-y-4" noValidate>
      <ClientPortalSection title={t("clientRequests.provider")} empty="" count={1}><label className="block text-sm font-medium text-gray-700" htmlFor="request-provider">{t("clientRequests.providerLabel")} <span aria-hidden="true">*</span></label><select id="request-provider" required className="input-field mt-1" value={relationshipId} onChange={(event) => changeProvider(event.target.value)}><option value="">{t("clientRequests.selectProvider")}</option>{options?.providers.map((item: any) => <option key={item._id} value={item._id}>{item.companyName}</option>)}</select></ClientPortalSection>
      <ClientPortalSection title={t("clientRequests.location")} empty={t("clientRequests.noLocations")} count={provider?.locations.length ?? 0}>{provider && <><label className="block text-sm font-medium text-gray-700" htmlFor="request-location">{t("clientRequests.locationLabel")} <span aria-hidden="true">*</span></label><select id="request-location" required className="input-field mt-1" value={locationKey} onChange={(event) => setLocationKey(event.target.value)}><option value="">{t("clientRequests.selectLocation")}</option>{provider.locations.map((item: any) => <option key={`${item.type}:${item.id}`} value={`${item.type}:${item.id}`}>{item.name}{item.address ? ` — ${item.address}` : ""}</option>)}</select></>}</ClientPortalSection>
      <ClientPortalSection title={t("clientRequests.service")} empty="" count={1}><div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="request-service" className="text-sm font-medium text-gray-700">{t("clientRequests.serviceLabel")} <span aria-hidden="true">*</span></label><select id="request-service" required className="input-field mt-1" value={service} onChange={(event) => setService(event.target.value)}><option value="">{t("clientRequests.selectService")}</option>{options?.services.map((item: string) => <option key={item} value={item}>{t(`clientRequests.services.${item}`, { defaultValue: item })}</option>)}</select></div><div><label htmlFor="request-date" className="text-sm font-medium text-gray-700">{t("clientRequests.preferredDate")} <span aria-hidden="true">*</span></label><input id="request-date" required type="date" min={minDate} className="input-field mt-1" value={date} onChange={(event) => setDate(event.target.value)} /></div><div><label htmlFor="request-time" className="text-sm font-medium text-gray-700">{t("clientRequests.preferredTime")} <span aria-hidden="true">*</span></label><select id="request-time" required className="input-field mt-1" value={timeWindow} onChange={(event) => setTimeWindow(event.target.value)}><option value="">{t("clientRequests.selectTime")}</option>{options?.timeWindows.map((item: string) => <option key={item} value={item}>{t(`clientRequests.timeWindows.${item}`)}</option>)}</select></div></div><p className="mt-3 text-sm text-gray-500">{t("clientRequests.preferenceNotice")}</p></ClientPortalSection>
      {availableAddOns.length > 0 && <ClientPortalSection title={t("clientRequests.addOns")} empty="" count={availableAddOns.length}><div className="grid gap-3 sm:grid-cols-2">{availableAddOns.map((item: any) => <div key={item.id} className="rounded-lg border border-gray-200 p-3"><label className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4" checked={Boolean(addOns[item.id])} onChange={(event) => toggleAddOn(item, event.target.checked)} /><span className="min-w-0"><span className="block break-words text-sm font-medium text-gray-900">{item.name}</span>{item.description && <span className="mt-1 block break-words text-sm text-gray-500">{item.description}</span>}<span className="mt-1 block text-sm text-gray-600">{item.pricingMethod === "starting_at" ? t("clientRequests.startingAt", { price: formatClientMoney(item.priceCents) }) : item.pricingMethod === "per_unit" ? t("clientRequests.perUnit", { price: formatClientMoney(item.priceCents), unit: item.unitLabel }) : formatClientMoney(item.priceCents)}</span></span></label>{addOns[item.id] && item.pricingMethod === "per_unit" && <label className="mt-3 block text-sm text-gray-700">{t("clientRequests.quantity")}<input type="number" min={1} max={999} className="input-field mt-1" value={addOns[item.id].quantity ?? 1} onChange={(event) => setAddOns((current) => ({ ...current, [item.id]: { ...current[item.id], quantity: Number(event.target.value) } }))} /></label>}</div>)}</div></ClientPortalSection>}
      <ClientPortalSection title={t("clientRequests.notes")} empty="" count={1}><label htmlFor="request-notes" className="text-sm font-medium text-gray-700">{t("clientRequests.notesLabel")}</label><textarea id="request-notes" rows={4} maxLength={2000} className="input-field mt-1" value={notes} onChange={(event) => setNotes(event.target.value)} /><p className="mt-1 text-xs text-gray-500">{t("clientRequests.notesHelp")}</p></ClientPortalSection>
      <div className="flex justify-end"><button type="submit" className="btn-primary touch-target w-full sm:w-auto">{t("clientRequests.reviewRequest")}</button></div>
    </form> : <ClientRequestReview provider={provider} location={location} service={service} date={date} timeWindow={timeWindow} addOns={selectedAddOns.map((item: any) => ({ ...item, ...addOns[item.id] }))} notes={notes} submitting={submitting} onEdit={() => setReviewing(false)} onSubmit={submit} />}
  </ClientPortalPage>;
}

export function ClientRequestReview({ provider, location, service, date, timeWindow, addOns, notes, submitting, onEdit, onSubmit }: any) {
  const { t } = useTranslation();
  return <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6"><div><h2 className="text-xl font-semibold text-gray-900">{t("clientRequests.reviewTitle")}</h2><p className="mt-1 text-sm text-gray-600">{t("clientRequests.reviewNotice")}</p></div><dl className="grid gap-4 sm:grid-cols-2"><ReviewItem label={t("clientRequests.provider")} value={provider?.companyName} /><ReviewItem label={t("clientRequests.location")} value={`${location?.name ?? ""}${location?.address ? ` — ${location.address}` : ""}`} /><ReviewItem label={t("clientRequests.service")} value={t(`clientRequests.services.${service}`, { defaultValue: service })} /><ReviewItem label={t("clientRequests.preferredDate")} value={date} /><ReviewItem label={t("clientRequests.preferredTime")} value={t(`clientRequests.timeWindows.${timeWindow}`)} /><ReviewItem label={t("clientRequests.addOns")} value={addOns.length ? addOns.map((item: any) => `${item.name}${item.quantity ? ` × ${item.quantity}` : ""}`).join(", ") : t("clientRequests.none")} /><ReviewItem label={t("clientRequests.notes")} value={notes || t("clientRequests.none")} /></dl><div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{t("clientRequests.awaitingNotice")}</div><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={submitting} className="btn-secondary touch-target" onClick={onEdit}>{t("clientRequests.editRequest")}</button><button type="button" disabled={submitting} className="btn-primary touch-target" onClick={onSubmit}>{submitting ? t("clientRequests.submitting") : t("clientRequests.submitRequest")}</button></div></section>;
}

function ReviewItem({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-medium text-gray-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-900">{value}</dd></div>; }
