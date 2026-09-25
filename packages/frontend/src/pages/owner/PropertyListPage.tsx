import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Link } from "wouter";
import { Building2, Plus, MapPin, Upload, Archive } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ImportPropertiesDialog } from "./ImportPropertiesDialog";

export function PropertyListPage() {
  const [managementFilter, setManagementFilter] = useState<"all" | "managed" | "unmanaged">("all");
  const { user, sessionToken } = useAuth();
  const { t } = useTranslation();
  const [showImport, setShowImport] = useState(false);
  const [selected, setSelected] = useState<Set<Id<"properties">>>(new Set());
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const properties = useQuery(
    api.queries.properties.list,
    user?.companyId ? { companyId: user.companyId, userId: user._id, sessionToken } : "skip"
  );

  const toggleActive = useMutation(api.mutations.properties.toggleActive);

  if (!user || properties === undefined) return <PageLoader />;
  const visibleProperties = properties.filter(p => managementFilter === "all" || (p.managementStatus ?? "managed") === managementFilter);

  const toggleSelected = (id: Id<"properties">) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === visibleProperties.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visibleProperties.map((p) => p._id)));
    }
  };

  const handleBatchArchive = async () => {
    setArchiving(true);
    try {
      for (const id of selected) {
        await toggleActive({ propertyId: id, userId: user._id, sessionToken });
      }
      setSelected(new Set());
      setShowArchiveConfirm(false);
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t("properties.title")}
        description={t("properties.description")}
        action={
          <div className="flex items-center gap-2">
            {user.role === "owner" && <button
              onClick={() => setShowImport(true)}
              className="btn-secondary flex items-center gap-2"
            >
              <Upload className="w-4 h-4" /> {t("properties.import.button")}
            </button>}
            {(user.role === "owner" || user.canManageClients) && <Link href="/properties/new" className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> {t("properties.addProperty")}
            </Link>}
          </div>
        }
      />

      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label={t("quick.location")}>
        {(["all", "managed", "unmanaged"] as const).map(status => <button key={status} type="button" className={managementFilter === status ? "btn-primary" : "btn-secondary"} onClick={() => { setManagementFilter(status); setSelected(new Set()); }}>{t(`quick.${status}`)}</button>)}
      </div>

      {user.companyId && (
        <ImportPropertiesDialog
          open={showImport}
          onOpenChange={setShowImport}
          companyId={user.companyId}
          userId={user._id}
        />
      )}

      {/* Batch action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-lg border">
          <span className="text-sm font-medium text-gray-700">
            {t("properties.selected", { count: selected.size })}
          </span>
          <button
            onClick={() => setShowArchiveConfirm(true)}
            className="btn-secondary text-sm flex items-center gap-1.5"
          >
            <Archive className="w-3.5 h-3.5" />
            {t("properties.archive")}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            {t("properties.deselectAll")}
          </button>
        </div>
      )}

      {/* Batch archive confirmation */}
      <ConfirmDialog
        open={showArchiveConfirm}
        onOpenChange={setShowArchiveConfirm}
        title={
          selected.size === 1
            ? t("properties.archiveConfirmTitle")
            : t("properties.archiveConfirmTitleBatch", { count: selected.size })
        }
        description={
          selected.size === 1
            ? t("properties.archiveConfirmDesc")
            : t("properties.archiveConfirmDescBatch", { count: selected.size })
        }
        confirmLabel={
          selected.size === 1
            ? t("properties.archiveProperty")
            : t("properties.archiveProperties", { count: selected.size })
        }
        confirmVariant="danger"
        onConfirm={handleBatchArchive}
        loading={archiving}
      />

      {properties.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={t("properties.noPropertiesYet")}
          description={t("properties.noPropertiesDesc")}
          action={
            (user.role === "owner" || user.canManageClients) ? <Link href="/properties/new" className="btn-primary">{t("properties.addProperty")}</Link> : undefined
          }
        />
      ) : (
        <>
          {/* Select all toggle */}
          {user.role === "owner" && <div className="flex items-center gap-2 mb-3">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={selected.size === visibleProperties.length && visibleProperties.length > 0}
                onChange={toggleSelectAll}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              {t("properties.selectAll")}
            </label>
          </div>}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleProperties.map((property) => (
              <div key={property._id} className="relative">
                {/* Checkbox overlay */}
                {user.role === "owner" && <label
                  className="absolute top-3 left-3 z-10 cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(property._id)}
                    onChange={() => toggleSelected(property._id)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </label>}

                <Link
                  href={`/properties/${property._id}`}
                  className={`card hover:shadow-md transition-shadow block pl-10 ${
                    selected.has(property._id) ? "ring-2 ring-primary-300 bg-primary-50/30" : ""
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-gray-900">{property.name}</h3>
                    <StatusBadge status={property.active ? "active" : "inactive"} />
                  </div>
                  <div className="text-xs text-gray-500 mb-1">{t(`quick.${property.managementStatus ?? "managed"}`)}</div>
                  <div className="flex items-center gap-1 text-sm text-gray-500 mb-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {property.address}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span className="capitalize">{String(t(`properties.propertyTypes.${property.type}` as const, property.type.replace(/_/g, " ")))}</span>
                    {(property.beds != null || property.baths != null) && (
                      <span className="text-gray-400">
                        {[
                          property.beds != null ? `${property.beds} ${property.beds !== 1 ? t("properties.beds").toLowerCase() : t("properties.beds").toLowerCase().replace(/s$/, "")}` : null,
                          property.baths != null ? `${property.baths} ${property.baths !== 1 ? t("properties.baths").toLowerCase() : t("properties.baths").toLowerCase().replace(/s$/, "")}` : null,
                        ].filter(Boolean).join(" / ")}
                      </span>
                    )}
                  </div>
                  {property.amenities.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {property.amenities.slice(0, 3).map((a: string) => (
                        <span key={a} className="badge bg-gray-100 text-gray-600">
                          {a}
                        </span>
                      ))}
                      {property.amenities.length > 3 && (
                        <span className="badge bg-gray-100 text-gray-600">
                          +{property.amenities.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </Link>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
