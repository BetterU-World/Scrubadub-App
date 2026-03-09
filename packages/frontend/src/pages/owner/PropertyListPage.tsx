import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Link } from "wouter";
import { Building2, Plus, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";

export function PropertyListPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const properties = useQuery(
    api.queries.properties.list,
    user?.companyId ? { companyId: user.companyId, userId: user._id } : "skip"
  );

  if (!user || properties === undefined) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title={t("properties.title")}
        description={t("properties.description")}
        action={
          <Link href="/properties/new" className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> {t("properties.addProperty")}
          </Link>
        }
      />

      {properties.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={t("properties.noPropertiesYet")}
          description={t("properties.noPropertiesDesc")}
          action={
            <Link href="/properties/new" className="btn-primary">{t("properties.addProperty")}</Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {properties.map((property) => (
            <Link key={property._id} href={`/properties/${property._id}`} className="card hover:shadow-md transition-shadow block">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-gray-900">{property.name}</h3>
                  <StatusBadge status={property.active ? "active" : "inactive"} />
                </div>
                <div className="flex items-center gap-1 text-sm text-gray-500 mb-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {property.address}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span className="capitalize">{property.type.replace(/_/g, " ")}</span>
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
                    {property.amenities.slice(0, 3).map((a) => (
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
          ))}
        </div>
      )}
    </div>
  );
}
