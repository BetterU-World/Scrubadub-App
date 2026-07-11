import { Copy, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export type BedType = "standard_bed" | "bunk_bed" | "sofa_bed" | "futon" | "daybed" | "crib" | "rollaway" | "other";
export type BedSize = "twin" | "twin_xl" | "full" | "queen" | "king" | "california_king" | "crib" | "custom" | "not_applicable";
export type PropertyBedroom = { id: string; label: string; beds: Array<{ id: string; type: BedType; size: BedSize; quantity: number; sheetSets: number; sleepingPillows: number }> };

const BED_TYPES: BedType[] = ["standard_bed", "bunk_bed", "sofa_bed", "futon", "daybed", "crib", "rollaway", "other"];
const BED_SIZES: BedSize[] = ["twin", "twin_xl", "full", "queen", "king", "california_king", "crib", "custom", "not_applicable"];
const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
const newBed = () => ({ id: newId(), type: "standard_bed" as BedType, size: "queen" as BedSize, quantity: 1, sheetSets: 1, sleepingPillows: 2 });

export function BedroomsEditor({ bedrooms, onChange }: { bedrooms: PropertyBedroom[]; onChange: (bedrooms: PropertyBedroom[]) => void }) {
  const { t } = useTranslation();
  const updateBedroom = (index: number, patch: Partial<PropertyBedroom>) => onChange(bedrooms.map((room, i) => i === index ? { ...room, ...patch } : room));
  const totals = bedrooms.reduce((result, room) => {
    result.beds += room.beds.reduce((sum, bed) => sum + bed.quantity, 0);
    result.sheets += room.beds.reduce((sum, bed) => sum + bed.quantity * bed.sheetSets, 0);
    result.pillows += room.beds.reduce((sum, bed) => sum + bed.quantity * bed.sleepingPillows, 0);
    return result;
  }, { beds: 0, sheets: 0, pillows: 0 });
  return <section className="space-y-3 rounded-lg border border-gray-200 p-4">
    <div><h2 className="font-semibold text-gray-900">{t("properties.bedroomProfile.title")}</h2><p className="text-sm text-gray-500">{t("properties.bedroomProfile.helper")}</p></div>
    {bedrooms.length > 0 && <div className="flex flex-wrap gap-3 rounded-md bg-primary-50 px-3 py-2 text-xs text-primary-800"><span>{bedrooms.length} {t("properties.bedroomProfile.bedrooms")}</span><span>{totals.beds} {t("properties.bedroomProfile.totalBeds")}</span><span>{totals.sheets} {t("properties.sheetSets")}</span><span>{totals.pillows} {t("properties.bedroomProfile.sleepingPillows")}</span></div>}
    {bedrooms.map((room, roomIndex) => <div key={room.id} className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-end gap-2"><label className="flex-1"><span className="text-xs font-medium text-gray-600">{t("properties.bedroomProfile.bedroomLabel")}</span><input required className="input-field mt-1" value={room.label} onChange={(e) => updateBedroom(roomIndex, { label: e.target.value })} placeholder={t("properties.bedroomProfile.labelPlaceholder")} /></label><button type="button" className="p-2 text-red-600" title={t("properties.bedroomProfile.removeBedroom")} onClick={() => onChange(bedrooms.filter((_, i) => i !== roomIndex))}><Trash2 className="h-4 w-4" /></button></div>
      {room.beds.map((bed, bedIndex) => <div key={bed.id} className="rounded-md border border-gray-200 bg-white p-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <label><span className="text-xs text-gray-500">{t("properties.bedroomProfile.type")}</span><select className="input-field mt-1 text-sm" value={bed.type} onChange={(e) => updateBedroom(roomIndex, { beds: room.beds.map((item, i) => i === bedIndex ? { ...item, type: e.target.value as BedType } : item) })}>{BED_TYPES.map((value) => <option key={value} value={value}>{t(`properties.bedroomProfile.types.${value}`)}</option>)}</select></label>
          <label><span className="text-xs text-gray-500">{t("properties.bedroomProfile.size")}</span><select className="input-field mt-1 text-sm" value={bed.size} onChange={(e) => updateBedroom(roomIndex, { beds: room.beds.map((item, i) => i === bedIndex ? { ...item, size: e.target.value as BedSize } : item) })}>{BED_SIZES.map((value) => <option key={value} value={value}>{t(`properties.bedroomProfile.sizes.${value}`)}</option>)}</select></label>
          {(["quantity", "sheetSets", "sleepingPillows"] as const).map((field) => <label key={field}><span className="text-xs text-gray-500">{t(`properties.bedroomProfile.${field}`)}</span><input required type="number" min={field === "quantity" ? 1 : 0} step="1" className="input-field mt-1 text-sm" value={bed[field]} onChange={(e) => updateBedroom(roomIndex, { beds: room.beds.map((item, i) => i === bedIndex ? { ...item, [field]: Number(e.target.value) } : item) })} /></label>)}
        </div><div className="mt-2 flex justify-end gap-2"><button type="button" className="flex items-center gap-1 text-xs text-gray-600" onClick={() => updateBedroom(roomIndex, { beds: [...room.beds.slice(0, bedIndex + 1), { ...bed, id: newId() }, ...room.beds.slice(bedIndex + 1)] })}><Copy className="h-3.5 w-3.5" />{t("properties.bedroomProfile.duplicateBed")}</button><button type="button" className="flex items-center gap-1 text-xs text-red-600" onClick={() => updateBedroom(roomIndex, { beds: room.beds.filter((_, i) => i !== bedIndex) })}><Trash2 className="h-3.5 w-3.5" />{t("properties.bedroomProfile.removeBed")}</button></div>
      </div>)}
      <button type="button" className="btn-secondary flex items-center gap-1 text-xs" onClick={() => updateBedroom(roomIndex, { beds: [...room.beds, newBed()] })}><Plus className="h-3.5 w-3.5" />{t("properties.bedroomProfile.addBed")}</button>
    </div>)}
    <button type="button" className="btn-secondary flex items-center gap-2 text-sm" onClick={() => onChange([...bedrooms, { id: newId(), label: `${t("properties.bedroomProfile.bedroom")} ${bedrooms.length + 1}`, beds: [newBed()] }])}><Plus className="h-4 w-4" />{t("properties.bedroomProfile.addBedroom")}</button>
  </section>;
}

export function BedroomsDisplay({ bedrooms, compact = false }: { bedrooms: PropertyBedroom[]; compact?: boolean }) {
  const { t } = useTranslation();
  if (!bedrooms?.length) return null;
  return <div className="space-y-2">{bedrooms.map((room) => <div key={room.id} className="rounded-md border border-gray-200 bg-white p-3"><p className="text-sm font-semibold text-gray-900">{room.label}</p><div className={`mt-2 ${compact ? "space-y-1" : "grid gap-2 sm:grid-cols-2"}`}>{room.beds.map((bed) => <div key={bed.id} className="text-xs text-gray-600"><span className="font-medium text-gray-800">{bed.quantity}× {t(`properties.bedroomProfile.sizes.${bed.size}`)} {t(`properties.bedroomProfile.types.${bed.type}`)}</span><span className="block">{bed.quantity * bed.sheetSets} {t("properties.sheetSets").toLowerCase()} · {bed.quantity * bed.sleepingPillows} {t("properties.bedroomProfile.sleepingPillows").toLowerCase()}</span></div>)}</div></div>)}</div>;
}
