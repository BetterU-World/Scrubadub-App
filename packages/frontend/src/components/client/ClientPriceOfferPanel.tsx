import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { useClientAuth } from "@/hooks/useClientAuth";

export function ClientPriceOfferPanel({ requestId }: { requestId: string }) {
  const { t } = useTranslation();
  const { clientUserId, sessionToken } = useClientAuth();
  const data = useQuery((api as any).queries.servicePriceOffers.forClientRequest, clientUserId && sessionToken ? { clientUserId, sessionToken, requestId } : "skip");
  const respond = useMutation((api as any).mutations.servicePriceOffers.respond);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const offer = data?.offer;
  if (!data) return null;
  const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);
  const action = async (decision: "accepted" | "declined") => { setBusy(true); setError(""); try { await respond({ clientUserId, sessionToken, offerId: offer._id, decision }); } catch (e: any) { setError(e.message || t("jobPricing.failed")); } finally { setBusy(false); } };
  return <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6" aria-label={t("jobPricing.title")}>
    <h2 className="font-semibold">{t("jobPricing.title")}</h2>
    {!offer ? <p className="mt-2 text-sm text-gray-600">{t("jobPricing.clientPending")}</p> : <><p className="mt-2 text-sm text-gray-700">{t(`jobPricing.offerStates.${offer.status}`)} · {t("jobPricing.offerVersion", { version: offer.version })}</p><p className="mt-2 text-xl font-semibold">{money(offer.snapshot.totalCents)}</p><p className="text-sm text-gray-600">{t("jobPricing.baseAmount")}: {money(offer.snapshot.baseChargeCents)}</p>{offer.snapshot.addOns.map((line: any) => <p className="text-sm text-gray-600" key={line.snapshotId}>{line.name}: {money(line.amountCents)}</p>)}{offer.status === "issued" && <><p className="mt-3 text-sm text-gray-600">{t("jobPricing.clientConsentNotice")}</p><div className="mt-3 flex gap-2"><button type="button" className="btn-primary" disabled={busy} onClick={() => action("accepted")}>{t("jobPricing.accept")}</button><button type="button" className="btn-secondary" disabled={busy} onClick={() => action("declined")}>{t("jobPricing.decline")}</button></div></>}</>}
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
  </section>;
}
