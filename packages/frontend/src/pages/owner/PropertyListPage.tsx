import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Link } from "wouter";
import { Building2, Plus, MapPin } from "lucide-react";

export function PropertyListPage() {
  const { user } = useAuth();
  const properties = useQuery(
    api.queries.properties.list,
    user?.companyId ? { companyId: user.companyId, userId: user._id } : "skip"
  );

  if (!user || properties === undefined) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Properties"
        description="Manage your cleaning properties"
        action={
          <Link href="/properties/new">
            <a className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Property
            </a>
          </Link>
        }
      />

      {properties.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No properties yet"
          description="Add your first property to get started"
          action={
            <Link href="/properties/new">
              <a className="btn-primary">Add Property</a>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {properties.map((property) => (
            <Link key={property._id} href={`/properties/${property._id}`}>
              <a className="card hover:shadow-md transition-shadow block">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-gray-900">{property.name}</h3>
                  <StatusBadge status={property.active ? "active" : "inactive"} />
                </div>
                <div className="flex items-center gap-1 text-sm text-gray-500 mb-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {property.address}
                </div>
                <p className="text-sm text-gray-500 capitalize">
                  {property.type.replace(/_/g, " ")}
                </p>
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
              </a>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
