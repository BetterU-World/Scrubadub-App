import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

type AddOnSnapshot = {
  snapshotId: string;
  name: string;
  quantity?: number | null;
  unitLabel?: string | null;
  lineTotalCents?: number;
  billingCadence?: "one_time" | "monthly";
};

export function AddOnSnapshotList({ items, audience, showPricing = false }: { items?: AddOnSnapshot[]; audience: "worker" | "owner" | "client"; showPricing?: boolean }) {
  const { t, i18n } = useTranslation();
  if (!items?.length) return null;
  const money = (cents: number) => new Intl.NumberFormat(i18n.language === "es" ? "es-US" : "en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  const title = audience === "worker" ? t("addOnPropagation.requiredTitle") : audience === "client" ? t("addOnPropagation.committedTitle") : t("addOnPropagation.ownerTitle");
  return <section className="card space-y-3" aria-labelledby={`add-on-snapshot-${audience}`}>
    <div className="flex items-center gap-2">
      <Sparkles className="h-5 w-5 text-primary-600" aria-hidden="true" />
      <h2 id={`add-on-snapshot-${audience}`} className="text-sm font-semibold text-gray-900">{title}</h2>
    </div>
    {audience === "worker" && <p className="text-sm text-gray-600">{t("addOnPropagation.workerHelp")}</p>}
    <ul className="space-y-2">
      {items.map((item) => <li key={item.snapshotId} className="flex flex-col gap-1 rounded-md border border-gray-200 bg-gray-50 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium text-gray-900">{item.name}</p>
          {item.quantity != null && <p className="text-sm text-gray-600">{t("addOnPropagation.quantity", { quantity: item.quantity, unit: item.unitLabel ?? t("addOnPropagation.units") })}</p>}
        </div>
        {showPricing && item.lineTotalCents != null && <p className="text-sm font-semibold text-gray-900">{money(item.lineTotalCents)} · {item.billingCadence === "monthly" ? t("addOnPropagation.monthly") : t("addOnPropagation.oneTime")}</p>}
      </li>)}
    </ul>
  </section>;
}
