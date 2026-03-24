import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Archive, MapPin, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";

export function ArchivedPropertiesPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [restoreTarget, setRestoreTarget] = useState<Id<"properties"> | null>(null);
  const [restoring, setRestoring] = useState(false);

  const archived = useQuery(
    api.queries.properties.listArchived,
    user?.companyId ? { companyId: user.companyId, userId: user._id } : "skip"
  );

  const toggleActive = useMutation(api.mutations.properties.toggleActive);

  if (!user || archived === undefined) return <PageLoader />;

  const handleRestore = async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      await toggleActive({ propertyId: restoreTarget, userId: user._id });
      setRestoreTarget(null);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t("properties.archivedProperties")}
        description={t("properties.archivedPropertiesDesc")}
      />

      <ConfirmDialog
        open={restoreTarget !== null}
        onOpenChange={(open) => { if (!open) setRestoreTarget(null); }}
        title={t("properties.restoreConfirmTitle")}
        description={t("properties.restoreConfirmDesc")}
        confirmLabel={t("properties.restoreProperty")}
        onConfirm={handleRestore}
        loading={restoring}
      />

      {archived.length === 0 ? (
        <EmptyState
          icon={Archive}
          title={t("properties.noArchivedProperties")}
          description={t("properties.noArchivedPropertiesDesc")}
        />
      ) : (
        <div className="space-y-2">
          {archived.map((property) => (
            <div
              key={property._id}
              className="card flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900">{property.name}</h3>
                <div className="flex items-center gap-1 text-sm text-gray-500">
                  <MapPin className="w-3.5 h-3.5" />
                  {property.address}
                </div>
                <div className="text-sm text-gray-500 capitalize mt-0.5">
                  {t(`properties.propertyTypes.${property.type}`, property.type.replace(/_/g, " "))}
                  {property.beds != null && ` · ${property.beds} ${t("properties.beds").toLowerCase()}`}
                  {property.baths != null && ` · ${property.baths} ${t("properties.baths").toLowerCase()}`}
                </div>
              </div>
              <button
                onClick={() => setRestoreTarget(property._id)}
                className="btn-secondary text-sm flex items-center gap-1.5 shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {t("properties.restoreProperty")}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
