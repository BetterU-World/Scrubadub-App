import { useTranslation } from "react-i18next";
import type { EstimateInput } from "../../../../../convex/lib/smartEstimatePricing";

export type EstimateFacts = Partial<Record<"areaHundredths" | "bedrooms" | "bathHalves", { value: number; source: "walkthrough" | "property" }>>;
const strategies: EstimateInput["strategy"][] = ["flat", "square_feet", "hourly", "rooms"];

export function changeEstimateStrategy(input: EstimateInput, strategy: EstimateInput["strategy"]): EstimateInput {
  const { cadence, minimumCents, areaHundredths, bedrooms, bathHalves, laborMinutes } = input;
  return { strategy, cadence, minimumCents, areaHundredths, bedrooms, bathHalves, laborMinutes };
}

export function EstimateNumber({ label, value, scale, onChange, hint }: {
  label: string; value?: number; scale: number; onChange: (value?: number) => void; hint?: string;
}) {
  const { t } = useTranslation();
  return <label className="block min-w-0 text-sm font-medium">
    {t(label)}
    <input className="input-field mt-1" inputMode={scale === 1 ? "numeric" : "decimal"} type="number"
      min={0} max={1e9 / scale} step={1 / scale} value={value === undefined ? "" : value / scale}
      onChange={event => {
        const scaled = Number(event.target.value) * scale;
        const rounded = Math.round(scaled);
        onChange(event.target.value === "" || !Number.isFinite(scaled) || Math.abs(rounded - scaled) > 1e-6 || rounded < 0 || rounded > 1e9 ? undefined : rounded);
      }} />
    {hint && <span className="mt-1 block text-xs font-normal text-gray-600">{hint}</span>}
  </label>;
}

export function SmartEstimateFields({ input, onChange, facts }: {
  input: EstimateInput; onChange: (input: EstimateInput) => void; facts?: EstimateFacts;
}) {
  const { t, i18n } = useTranslation();
  function number(field: Exclude<keyof EstimateInput, "strategy" | "cadence">, scale: number) {
    const prefill = field === "areaHundredths" || field === "bedrooms" || field === "bathHalves" ? facts?.[field] : undefined;
    return <EstimateNumber key={field} label={`smartEstimates.fields.${field}`} value={input[field]} scale={scale}
      hint={prefill ? t("smartEstimates.prefill", { value: new Intl.NumberFormat(i18n.language).format(prefill.value / scale), source: t(`smartEstimates.sources.${prefill.source}`) }) : undefined}
      onChange={value => onChange({ ...input, [field]: value })} />;
  }
  return <div className="grid gap-3 sm:grid-cols-2">
    <label className="block text-sm font-medium">{t("smartEstimates.strategy")}
      <select className="input-field mt-1" value={input.strategy} onChange={e => onChange(changeEstimateStrategy(input, e.target.value as EstimateInput["strategy"]))}>
        {strategies.map(strategy => <option key={strategy} value={strategy}>{t(`smartEstimates.strategies.${strategy}`)}</option>)}
      </select>
    </label>
    <label className="block text-sm font-medium">{t("smartEstimates.cadence")}
      <select className="input-field mt-1" value={input.cadence} onChange={e => onChange({ ...input, cadence: e.target.value as EstimateInput["cadence"] })}>
        <option value="one_time">{t("smartEstimates.oneTime")}</option><option value="monthly">{t("smartEstimates.monthly")}</option>
      </select>
    </label>
    {(input.strategy === "flat" || input.strategy === "rooms") && number("baseCents", 100)}
    {input.strategy === "square_feet" && <>{number("areaHundredths", 100)}{number("areaRateHundredthCents", 10000)}</>}
    {input.strategy === "hourly" && <>
      {number("laborMinutes", 1)}{number("hourlyRateCents", 100)}
      <p className="text-xs text-gray-600 sm:col-span-2">{t("smartEstimates.laborHelp")}</p>
    </>}
    {input.strategy === "rooms" && <>{number("bedrooms", 1)}{number("bedroomRateCents", 100)}{number("bathHalves", 2)}{number("bathroomRateCents", 100)}</>}
    {number("minimumCents", 100)}
  </div>;
}
