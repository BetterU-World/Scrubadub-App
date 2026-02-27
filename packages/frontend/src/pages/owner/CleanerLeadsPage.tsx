import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Link } from "wouter";
import {
  UserPlus,
  Mail,
  Phone,
  MapPin,
  Car,
  Clock,
  Briefcase,
  X,
} from "lucide-react";

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "new", label: "New" },
  { value: "reviewed", label: "Reviewed" },
  { value: "contacted", label: "Contacted" },
  { value: "archived", label: "Archived" },
];

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function CleanerLeadsPage() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState<Id<"cleanerLeads"> | null>(null);

  const leads = useQuery(
    api.queries.cleanerLeads.getCompanyCleanerLeads,
    user?._id
      ? {
          userId: user._id,
          status: (statusFilter as any) || undefined,
        }
      : "skip"
  );

  const selectedLead = useQuery(
    api.queries.cleanerLeads.getCleanerLeadById,
    selectedId && user?._id
      ? { id: selectedId, userId: user._id }
      : "skip"
  );

  const updateStatus = useMutation(
    api.mutations.cleanerLeads.updateCleanerLeadStatus
  );

  const [updating, setUpdating] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  if (!user || leads === undefined) return <PageLoader />;

  const handleStatusChange = async (
    leadId: Id<"cleanerLeads">,
    status: "reviewed" | "contacted" | "archived"
  ) => {
    setUpdating(true);
    try {
      await updateStatus({ leadId, userId: user._id, status });
      setToast({ message: `Marked as ${status}`, type: "success" });
      setTimeout(() => setToast(null), 3000);
    } catch (err: any) {
      setToast({
        message: err.message || "Failed to update",
        type: "error",
      });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Cleaner Leads"
        description="Applications from your public site"
        action={
          <Link href="/employees?invite=true" className="btn-primary flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> Invite Employee
          </Link>
        }
      />

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={
              statusFilter === opt.value
                ? "badge bg-primary-100 text-primary-800 cursor-pointer"
                : "badge bg-gray-100 text-gray-600 cursor-pointer hover:bg-gray-200"
            }
          >
            {opt.label}
          </button>
        ))}
      </div>

      {leads.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="No leads yet"
          description={
            statusFilter
              ? "No leads match this filter."
              : "Cleaner applications from your public site will appear here."
          }
          action={
            !statusFilter && (
              <Link href="/employees?invite=true" className="btn-primary">
                Invite your first cleaner
              </Link>
            )
          }
        />
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => (
            <button
              key={lead._id}
              onClick={() => setSelectedId(lead._id)}
              className="card block w-full text-left hover:shadow-md transition-shadow"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">
                      {lead.name}
                    </h3>
                    <StatusBadge status={lead.status} />
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5" />
                      {lead.email}
                    </span>
                    {lead.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5" />
                        {lead.phone}
                      </span>
                    )}
                    {lead.city && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />
                        {lead.city}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {timeAgo(lead.createdAt)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Detail drawer */}
      {selectedId && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div
            className="fixed inset-0 bg-black/30"
            onClick={() => setSelectedId(null)}
          />
          <div className="relative w-full max-w-md bg-white shadow-xl overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Lead Details
              </h2>
              <button
                onClick={() => setSelectedId(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedLead === undefined ? (
              <div className="flex justify-center py-12">
                <PageLoader />
              </div>
            ) : selectedLead === null ? (
              <div className="text-center py-12 text-gray-500">
                Lead not found
              </div>
            ) : (
              <div className="p-4 space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xl font-bold text-gray-900">
                    {selectedLead.name}
                  </h3>
                  <StatusBadge status={selectedLead.status} />
                </div>

                <div className="text-xs text-gray-400">
                  Applied {new Date(selectedLead.createdAt).toLocaleString()}
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <a
                      href={`mailto:${selectedLead.email}`}
                      className="text-primary-600 hover:underline"
                    >
                      {selectedLead.email}
                    </a>
                  </div>
                  {selectedLead.phone && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Phone className="w-4 h-4 text-gray-400" />
                      {selectedLead.phone}
                    </div>
                  )}
                  {selectedLead.city && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <MapPin className="w-4 h-4 text-gray-400" />
                      {selectedLead.city}
                    </div>
                  )}
                  {selectedLead.hasCar != null && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Car className="w-4 h-4 text-gray-400" />
                      {selectedLead.hasCar
                        ? "Has reliable transportation"
                        : "No car"}
                    </div>
                  )}
                  {selectedLead.experience && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Briefcase className="w-4 h-4 text-gray-400" />
                      {selectedLead.experience}
                    </div>
                  )}
                  {selectedLead.availability && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Clock className="w-4 h-4 text-gray-400" />
                      {selectedLead.availability}
                    </div>
                  )}
                </div>

                {selectedLead.notes && (
                  <div className="border-t pt-3">
                    <p className="text-sm font-medium text-gray-700 mb-1">
                      Notes
                    </p>
                    <p className="text-sm text-gray-600">
                      {selectedLead.notes}
                    </p>
                  </div>
                )}

                {/* Status actions */}
                {selectedLead.status !== "archived" && (
                  <div className="border-t pt-4 flex flex-wrap gap-2">
                    {selectedLead.status === "new" && (
                      <button
                        onClick={() =>
                          handleStatusChange(selectedLead._id, "reviewed")
                        }
                        disabled={updating}
                        className="btn-secondary text-sm"
                      >
                        {updating ? "Updating..." : "Mark Reviewed"}
                      </button>
                    )}
                    {(selectedLead.status === "new" ||
                      selectedLead.status === "reviewed") && (
                      <button
                        onClick={() =>
                          handleStatusChange(selectedLead._id, "contacted")
                        }
                        disabled={updating}
                        className="btn-primary text-sm"
                      >
                        {updating ? "Updating..." : "Mark Contacted"}
                      </button>
                    )}
                    <button
                      onClick={() =>
                        handleStatusChange(selectedLead._id, "archived")
                      }
                      disabled={updating}
                      className="btn-secondary text-sm text-gray-500"
                    >
                      {updating ? "Archiving..." : "Archive"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
            toast.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
