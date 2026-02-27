import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useParams, Link, useLocation } from "wouter";
import {
  MapPin,
  Key,
  Wrench,
  Pencil,
  ToggleLeft,
  ToggleRight,
  Lock,
  Clock,
  Flag,
  Briefcase,
  AlertTriangle,
} from "lucide-react";

type Tab = "details" | "history";

export function PropertyDetailPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("details");
  const [toast, setToast] = useState<string | null>(null);

  // Read flash toast from sessionStorage (set by PropertyFormPage)
  useEffect(() => {
    const msg = sessionStorage.getItem("scrubadub_toast");
    if (msg) {
      sessionStorage.removeItem("scrubadub_toast");
      setToast(msg);
      setTimeout(() => setToast(null), 3000);
    }
  }, []);

  const property = useQuery(api.queries.properties.get,
    user ? { propertyId: params.id as Id<"properties">, userId: user._id } : "skip"
  );
  const toggleActive = useMutation(api.mutations.properties.toggleActive);

  const history = useQuery(
    api.queries.properties.getHistory,
    activeTab === "history" && user ? { propertyId: params.id as Id<"properties">, userId: user._id } : "skip"
  );

  if (property === undefined) return <PageLoader />;
  if (property === null)
    return <div className="text-center py-12 text-gray-500">Property not found</div>;

  return (
    <div className="max-w-3xl mx-auto">
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium bg-green-600 text-white">
          {toast}
        </div>
      )}
      <PageHeader
        title={property.name}
        action={
          <div className="flex gap-2">
            <button
              onClick={async () => {
                await toggleActive({ propertyId: property._id, userId: user!._id });
              }}
              className="btn-secondary flex items-center gap-2"
            >
              {property.active ? (
                <ToggleRight className="w-4 h-4" />
              ) : (
                <ToggleLeft className="w-4 h-4" />
              )}
              {property.active ? "Deactivate" : "Activate"}
            </button>
            <Link href={`/properties/${property._id}/edit`} className="btn-primary flex items-center gap-2">
              <Pencil className="w-4 h-4" /> Edit
            </Link>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab("details")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "details"
              ? "border-primary-600 text-primary-600"
              : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
          }`}
        >
          Details
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === "history"
              ? "border-primary-600 text-primary-600"
              : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
          }`}
        >
          <Clock className="w-4 h-4" />
          History
        </button>
      </div>

      {activeTab === "details" && <DetailsTab property={property} />}
      {activeTab === "history" && (
        <HistoryTab
          propertyId={params.id as Id<"properties">}
          history={history}
        />
      )}
    </div>
  );
}

function DetailsTab({ property }: { property: any }) {
  const hasStructuredAmenities =
    property.towelCount != null ||
    property.sheetSets != null ||
    property.pillowCount != null;

  return (
    <div className="card space-y-6">
      <div className="flex items-center gap-2">
        <StatusBadge status={property.active ? "active" : "inactive"} />
        <span className="text-sm text-gray-500 capitalize">
          {property.type.replace(/_/g, " ")}
        </span>
      </div>

      <div>
        <div className="flex items-center gap-2 text-gray-700">
          <MapPin className="w-4 h-4 text-gray-400" />
          <span>{property.address}</span>
        </div>
      </div>

      {(property.beds != null || property.baths != null || property.linenCount != null) && (
        <div className="grid grid-cols-3 gap-4">
          {property.beds != null && (
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-semibold text-gray-800">{property.beds}</div>
              <div className="text-xs text-gray-500 mt-1">Beds</div>
            </div>
          )}
          {property.baths != null && (
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-semibold text-gray-800">{property.baths}</div>
              <div className="text-xs text-gray-500 mt-1">Baths</div>
            </div>
          )}
          {property.linenCount != null && (
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-semibold text-gray-800">{property.linenCount}</div>
              <div className="text-xs text-gray-500 mt-1">Linens</div>
            </div>
          )}
        </div>
      )}

      {property.accessInstructions && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-1 flex items-center gap-1">
            <Key className="w-4 h-4" /> Access Instructions
          </h3>
          <p className="text-gray-700 whitespace-pre-wrap">
            {property.accessInstructions}
          </p>
        </div>
      )}

      {property.amenities.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-2">Amenities</h3>
          <div className="flex flex-wrap gap-2">
            {property.amenities.map((a: string) => (
              <span key={a} className="badge bg-primary-100 text-primary-700">
                {a}
              </span>
            ))}
          </div>
        </div>
      )}

      {hasStructuredAmenities && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-2">
            Linen & Supply Counts
          </h3>
          <div className="grid grid-cols-3 gap-4">
            {property.towelCount != null && (
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-semibold text-gray-800">
                  {property.towelCount}
                </div>
                <div className="text-xs text-gray-500 mt-1">Towels</div>
              </div>
            )}
            {property.sheetSets != null && (
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-semibold text-gray-800">
                  {property.sheetSets}
                </div>
                <div className="text-xs text-gray-500 mt-1">Sheet Sets</div>
              </div>
            )}
            {property.pillowCount != null && (
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-semibold text-gray-800">
                  {property.pillowCount}
                </div>
                <div className="text-xs text-gray-500 mt-1">Pillows</div>
              </div>
            )}
          </div>
        </div>
      )}

      {property.maintenanceNotes && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-1 flex items-center gap-1">
            <Wrench className="w-4 h-4" /> Maintenance Notes
          </h3>
          <p className="text-gray-700 whitespace-pre-wrap">
            {property.maintenanceNotes}
          </p>
        </div>
      )}

      {property.ownerNotes && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-1 flex items-center gap-1">
            <Lock className="w-4 h-4" /> Owner Notes
          </h3>
          <p className="text-gray-700 whitespace-pre-wrap">
            {property.ownerNotes}
          </p>
        </div>
      )}
    </div>
  );
}

function HistoryTab({
  propertyId,
  history,
}: {
  propertyId: Id<"properties">;
  history: any;
}) {
  if (history === undefined) return <PageLoader />;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Briefcase className="w-4 h-4 text-gray-400" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Total Jobs
            </span>
          </div>
          <div className="text-2xl font-semibold text-gray-800">
            {history.totalJobs}
          </div>
        </div>
        <div className="card text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Flag className="w-4 h-4 text-red-400" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Total Red Flags
            </span>
          </div>
          <div className="text-2xl font-semibold text-gray-800">
            {history.totalRedFlags}
          </div>
        </div>
        <div className="card text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-orange-400" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Open Red Flags
            </span>
          </div>
          <div className="text-2xl font-semibold text-orange-600">
            {history.openRedFlags}
          </div>
        </div>
      </div>

      {/* Timeline */}
      {history.timeline.length === 0 ? (
        <div className="card text-center py-8 text-gray-500">
          No history yet for this property.
        </div>
      ) : (
        <div className="space-y-3">
          {history.timeline.map((item: any, index: number) => (
            <div key={`${item.type}-${item.timestamp}-${index}`}>
              {item.type === "job" ? (
                <JobTimelineItem item={item} />
              ) : (
                <RedFlagTimelineItem item={item} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function JobTimelineItem({ item }: { item: any }) {
  const data = item.data;
  return (
    <div className="card flex items-start gap-3">
      <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
        <Briefcase className="w-4 h-4 text-blue-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-800">
            {data.title || "Cleaning Job"}
          </span>
          <StatusBadge status={data.status} />
        </div>
        {data.cleanerName && (
          <p className="text-sm text-gray-500 mt-0.5">
            Cleaner: {data.cleanerName}
          </p>
        )}
        <p className="text-xs text-gray-400 mt-1">{item.date}</p>
      </div>
    </div>
  );
}

function RedFlagTimelineItem({ item }: { item: any }) {
  const data = item.data;

  const severityStyles: Record<string, string> = {
    low: "bg-yellow-100 text-yellow-800",
    medium: "bg-orange-100 text-orange-800",
    high: "bg-red-100 text-red-800",
    critical: "bg-red-200 text-red-900",
  };

  return (
    <div className="card flex items-start gap-3 border-l-4 border-l-red-400">
      <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-full bg-red-50 flex items-center justify-center">
        <Flag className="w-4 h-4 text-red-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-800">
            {data.title || "Red Flag"}
          </span>
          <StatusBadge status={data.status} />
          {data.severity && (
            <span
              className={`badge capitalize ${
                severityStyles[data.severity] || "bg-gray-100 text-gray-800"
              }`}
            >
              {data.severity}
            </span>
          )}
        </div>
        {data.description && (
          <p className="text-sm text-gray-600 mt-0.5 line-clamp-2">
            {data.description}
          </p>
        )}
        <p className="text-xs text-gray-400 mt-1">{item.date}</p>
      </div>
    </div>
  );
}
