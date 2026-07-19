import { useState } from "react";
import { useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";

export function ProposalCatalogAddOnPicker({ onAdd }: { onAdd: (companyAddOnId: string) => Promise<unknown> }) {
  const { user, sessionToken } = useAuth();
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState("");
  const catalog = useQuery(
    (api as any).queries.companyAddOns.list,
    user ? { userId: user._id, sessionToken, includeArchived: false } : "skip"
  ) as any[] | undefined;

  return <div className="flex flex-col gap-2 sm:flex-row">
    <select className="input-field flex-1" value={selectedId} onChange={(event) => setSelectedId(event.target.value)} aria-label={t("proposals.addOns.catalogPicker")}>
      <option value="">{t("proposals.addOns.chooseCatalog")}</option>
      {(catalog ?? []).filter((item) => item.isActive && item.archivedAt === undefined).map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
    </select>
    <button type="button" className="btn-secondary inline-flex items-center gap-2" disabled={!selectedId} onClick={async () => { await onAdd(selectedId); setSelectedId(""); }}>
      <Plus className="h-4 w-4" aria-hidden="true" />{t("proposals.addOns.addCatalog")}
    </button>
  </div>;
}
