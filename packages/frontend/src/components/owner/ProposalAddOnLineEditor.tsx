import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";

export function ProposalAddOnLineEditor({ line, onSave, onRemove, onFeedback, t }: { line: any; onSave: (values: any) => Promise<any>; onRemove: () => Promise<any>; onFeedback: (message: string, type: "success" | "error") => void; t: any }) {
  const [name, setName] = useState(line.name);
  const [method, setMethod] = useState(line.pricingMethod);
  const [price, setPrice] = useState(String(line.unitPriceCents / 100));
  const [unitLabel, setUnitLabel] = useState(line.unitLabel ?? "");
  const [quantity, setQuantity] = useState(String(line.quantity ?? 1));
  const [finalPrice, setFinalPrice] = useState(line.finalizedPriceCents ? String(line.finalizedPriceCents / 100) : "");
  const [cadence, setCadence] = useState(line.billingCadence);
  const [saving, setSaving] = useState(false);
  const editingRef = useRef(false);
  useEffect(() => {
    if (editingRef.current) return;
    setName(line.name);
    setMethod(line.pricingMethod);
    setPrice(String(line.unitPriceCents / 100));
    setUnitLabel(line.unitLabel ?? "");
    setQuantity(String(line.quantity ?? 1));
    setFinalPrice(line.finalizedPriceCents !== undefined ? String(line.finalizedPriceCents / 100) : "");
    setCadence(line.billingCadence);
  }, [line.name, line.pricingMethod, line.unitPriceCents, line.unitLabel, line.quantity, line.finalizedPriceCents, line.billingCadence]);
  const markEditing = () => { editingRef.current = true; };
  const sourceLabel = line.sourceType === "request_snapshot" ? t("proposals.addOns.requested") : line.sourceType === "catalog" ? t("proposals.addOns.catalog") : t("proposals.addOns.custom");
  const needsFinalPrice = method === "starting_at" && !finalPrice;
  return <div className={`rounded-lg border bg-gray-50 p-3 ${needsFinalPrice ? "border-amber-300" : "border-gray-200"}`}>
    <div className="mb-3 flex items-center justify-between gap-2"><span className="badge bg-white text-gray-600">{sourceLabel}</span><button type="button" onClick={onRemove} aria-label={t("proposals.addOns.remove", { name })} className="rounded p-1 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></div>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <label className="text-xs text-gray-600">{t("common.name")}<input className="input-field mt-1" value={name} onChange={(e) => { markEditing(); setName(e.target.value); }} /></label>
      <label className="text-xs text-gray-600">{t("proposals.addOns.method")}<select className="input-field mt-1" value={method} onChange={(e) => { markEditing(); const next = e.target.value; setMethod(next); if (next !== "starting_at") setFinalPrice(""); if (next !== "per_unit") { setUnitLabel(""); setQuantity("1"); } }}><option value="flat">{t("addOns.methods.flat")}</option><option value="starting_at">{t("addOns.methods.starting_at")}</option><option value="per_unit">{t("addOns.methods.per_unit")}</option></select></label>
      <label className="text-xs text-gray-600">{t("proposals.addOns.unitPrice")}<input className="input-field mt-1" type="number" min="0.01" step="0.01" value={price} onChange={(e) => { markEditing(); setPrice(e.target.value); }} /></label>
       {method === "per_unit" && <label className="text-xs text-gray-600">{t("publicSite.addOns.quantity")}<input className="input-field mt-1" type="number" min={1} max={999} step={1} value={quantity} onChange={(e) => { markEditing(); setQuantity(e.target.value); }} /></label>}
       {method === "per_unit" && <label className="text-xs text-gray-600">{t("proposals.addOns.unitLabel")}<input className="input-field mt-1" value={unitLabel} maxLength={40} onChange={(e) => { markEditing(); setUnitLabel(e.target.value); }} /></label>}
      {method === "starting_at" && <label className="text-xs text-gray-600">{t("proposals.addOns.finalPrice")}<input className="input-field mt-1" type="number" min={price || "0.01"} step="0.01" value={finalPrice} onChange={(e) => { markEditing(); setFinalPrice(e.target.value); }} />{needsFinalPrice && <span className="mt-1 block text-amber-700">{t("proposals.addOns.finalPriceRequired")}</span>}</label>}
      <label className="text-xs text-gray-600">{t("proposals.addOns.cadence")}<select className="input-field mt-1" value={cadence} onChange={(e) => { markEditing(); setCadence(e.target.value); }}><option value="one_time">{t("proposals.addOns.oneTime")}</option><option value="monthly">{t("proposals.addOns.monthly")}</option></select></label>
    </div>
     <button type="button" disabled={saving} className="btn-secondary mt-3 text-sm" onClick={async () => {
       setSaving(true);
       try {
         await onSave({
           name,
           pricingMethod: method,
           unitPriceCents: Math.round(Number(price) * 100),
           ...(method === "per_unit" ? { unitLabel, quantity: Number(quantity) } : {}),
           ...(method === "starting_at" && finalPrice ? { finalizedPriceCents: Math.round(Number(finalPrice) * 100) } : {}),
           billingCadence: cadence,
         });
         editingRef.current = false;
         onFeedback(t("proposals.addOns.lineSaved"), "success");
       } catch (err: any) {
         onFeedback(err.message || t("proposals.addOns.lineSaveFailed"), "error");
       } finally {
         setSaving(false);
       }
     }}>{saving ? t("common.saving") : t("proposals.addOns.saveLine")}</button>
  </div>;
}
