import { FormEvent, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { LeadsHeader } from "@/components/ui/LeadsHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Inbox, Calendar, MapPin, Sparkles, Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTimeAgo } from "@/hooks/useTimeAgo";

export function RequestListPage() {
  const { user, sessionToken } = useAuth();
  const { t } = useTranslation();
  const timeAgo = useTimeAgo();
  const [statusFilter, setStatusFilter] = useState("");
  const [showNewLead, setShowNewLead] = useState(false);
  const [creatingLead, setCreatingLead] = useState(false);
  const [leadError, setLeadError] = useState("");
  const [newLead, setNewLead] = useState({
    requesterName: "",
    requesterEmail: "",
    requesterPhone: "",
    propertyAddress: "",
    requestedService: "",
    leadType: "other",
    businessName: "",
    notes: "",
  });

  const statusOptions = [
    { value: "", label: t("requests.all") },
    { value: "new", label: t("status.new") },
    { value: "contacted", label: t("status.contacted") },
    { value: "accepted", label: t("status.accepted") },
    { value: "declined", label: t("status.declined") },
    { value: "converted", label: t("status.converted") },
    { value: "archived", label: t("status.archived") },
  ];

  const createManualLead = useMutation(
    api.mutations.clientRequests.createManualClientRequest
  );

  const requests = useQuery(
    api.queries.clientRequests.getCompanyRequests,
    user?.companyId && sessionToken
      ? {
          companyId: user.companyId,
          userId: user._id,
          sessionToken,
          status: (statusFilter as any) || undefined,
        }
      : "skip"
  );

  if (!user || requests === undefined) return <PageLoader />;

  const handleCreateLead = async (e: FormEvent) => {
    e.preventDefault();
    setLeadError("");
    setCreatingLead(true);
    try {
      await createManualLead({
        userId: user._id,
        sessionToken,
        requesterName: newLead.requesterName,
        requesterEmail: newLead.requesterEmail,
        requesterPhone: newLead.requesterPhone || undefined,
        propertyAddress: newLead.propertyAddress || undefined,
        requestedService: newLead.requestedService || undefined,
        leadType: newLead.leadType as any,
        businessName: newLead.businessName || undefined,
        notes: newLead.notes || undefined,
      });
      setNewLead({
        requesterName: "",
        requesterEmail: "",
        requesterPhone: "",
        propertyAddress: "",
        requestedService: "",
        leadType: "other",
        businessName: "",
        notes: "",
      });
      setShowNewLead(false);
    } catch (err: any) {
      setLeadError(err.message || "Failed to create lead");
    } finally {
      setCreatingLead(false);
    }
  };

  const sorted = [...requests].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <LeadsHeader />
        <button
          onClick={() => setShowNewLead(true)}
          className="btn-primary touch-target flex w-full items-center justify-center gap-2 sm:mt-1 sm:w-auto"
        >
          <Plus className="w-4 h-4" /> {t("requests.newLead")}
        </button>
      </div>

      {showNewLead && (
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">{t("requests.manualLead")}</h2>
            <button
              onClick={() => setShowNewLead(false)}
              className="touch-target flex items-center justify-center text-gray-400 hover:text-gray-600"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {leadError && (
            <div className="mb-3 p-2 rounded bg-red-50 text-red-700 text-sm">
              {leadError}
            </div>
          )}
          <form onSubmit={handleCreateLead} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input className="input-field" required placeholder={t("common.name")} value={newLead.requesterName} onChange={(e) => setNewLead({ ...newLead, requesterName: e.target.value })} />
              <input className="input-field" required type="email" placeholder={t("common.email")} value={newLead.requesterEmail} onChange={(e) => setNewLead({ ...newLead, requesterEmail: e.target.value })} />
              <input className="input-field" placeholder={t("common.phone")} value={newLead.requesterPhone} onChange={(e) => setNewLead({ ...newLead, requesterPhone: e.target.value })} />
              <select className="input-field" value={newLead.leadType} onChange={(e) => setNewLead({ ...newLead, leadType: e.target.value })}>
                {(["booking_request", "residential", "str_airbnb", "commercial", "move_out", "post_construction", "other"] as const).map((type) => (
                  <option key={type} value={type}>{t(`leadTypes.${type}`)}</option>
                ))}
              </select>
              <input className="input-field" placeholder={t("requests.businessName")} value={newLead.businessName} onChange={(e) => setNewLead({ ...newLead, businessName: e.target.value })} />
              <input className="input-field" placeholder={t("requests.service")} value={newLead.requestedService} onChange={(e) => setNewLead({ ...newLead, requestedService: e.target.value })} />
            </div>
            <input className="input-field" placeholder={t("common.address")} value={newLead.propertyAddress} onChange={(e) => setNewLead({ ...newLead, propertyAddress: e.target.value })} />
            <textarea className="input-field" rows={3} placeholder={t("common.notes")} value={newLead.notes} onChange={(e) => setNewLead({ ...newLead, notes: e.target.value })} />
            <button disabled={creatingLead} className="btn-primary touch-target w-full sm:w-auto" type="submit">
              {creatingLead ? t("requests.creatingLead") : t("requests.createLead")}
            </button>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-1" role="group" aria-label={t("nav.requests")}>
        {statusOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={
              statusFilter === opt.value
                ? "touch-target flex-none rounded-lg bg-primary-100 px-3 text-sm font-medium text-primary-800"
                : "touch-target flex-none rounded-lg bg-gray-100 px-3 text-sm font-medium text-gray-600 hover:bg-gray-200"
            }
          >
            {opt.label}
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={t("requests.noRequests")}
          description={
            statusFilter
              ? t("requests.noRequestsFilter")
              : t("requests.noRequestsEmpty")
          }
          action={
            !statusFilter && (
              <Link href="/site" className="btn-primary">
                {t("requests.shareBookingLink")}
              </Link>
            )
          }
        />
      ) : (
        <div className="space-y-3">
          {sorted.map((req) => (
            <Link
              key={req._id}
              href={`/requests/${req._id}`}
              className="card touch-target block hover:shadow-md transition-shadow"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="min-w-0 w-full">
                  <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-2">
                    <h3 className="break-words font-semibold text-gray-900">
                      {req.requesterName}
                    </h3>
                    <StatusBadge status={req.status} />
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-500">
                    {(req.propertySnapshot?.address) && (
                      <span className="flex min-w-0 items-start gap-1">
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        <span className="break-words">{req.propertySnapshot.address}</span>
                      </span>
                    )}
                    {req.requestedDate && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {req.requestedDate}
                      </span>
                    )}
                    {(req as any).requestedService && (
                      <span className="flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5" />
                        {(req as any).requestedService}
                      </span>
                    )}
                  </div>
                  {(req as any).notes && <p className="mt-2 line-clamp-2 break-words text-sm text-gray-600">{(req as any).notes}</p>}
                </div>
                <div className="flex w-full items-center justify-between gap-3 border-t border-gray-100 pt-3 sm:w-auto sm:border-0 sm:pt-0">
                  <span className="text-xs text-gray-400 whitespace-nowrap">{timeAgo(req.createdAt)}</span>
                  <span className="text-sm font-medium text-primary-700">{t("common.open")}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
