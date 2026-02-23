import { useState, FormEvent, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { requireUserId } from "@/lib/requireUserId";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader, LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useLocation, useParams, Link } from "wouter";
import { Building2, Users, Handshake } from "lucide-react";

const JOB_TYPES = [
  { value: "standard", label: "Standard Clean" },
  { value: "deep_clean", label: "Deep Clean" },
  { value: "turnover", label: "Turnover" },
  { value: "move_in_out", label: "Move In/Out" },
  { value: "maintenance", label: "Maintenance" },
] as const;

export function JobFormPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const params = useParams<{ id?: string }>();
  const isEditing = !!params.id;

  const properties = useQuery(
    api.queries.properties.list,
    user?.companyId ? { companyId: user.companyId, userId: user._id } : "skip"
  );
  const cleaners = useQuery(
    api.queries.employees.getCleaners,
    user?.companyId ? { companyId: user.companyId, userId: user._id } : "skip"
  );
  const maintenanceWorkers = useQuery(
    api.queries.employees.getMaintenanceWorkers,
    user?.companyId ? { companyId: user.companyId, userId: user._id } : "skip"
  );

  const connections = useQuery(
    api.queries.partners.listConnections,
    !isEditing && user ? { userId: user._id } : "skip"
  );

  const existing = useQuery(
    api.queries.jobs.get,
    params.id && user ? { jobId: params.id as Id<"jobs">, userId: user._id } : "skip"
  );

  const createJob = useMutation(api.mutations.jobs.create);
  const updateJob = useMutation(api.mutations.jobs.update);
  const shareJobMut = useMutation(api.mutations.partners.shareJob);
  const updateRequestStatus = useMutation(api.mutations.clientRequests.updateRequestStatus);

  const [propertyId, setPropertyId] = useState("");
  const [selectedCleaners, setSelectedCleaners] = useState<string[]>([]);
  const [type, setType] = useState("standard");
  const [scheduledDate, setScheduledDate] = useState("");
  const [startTime, setStartTime] = useState(isEditing ? "" : "10:00");
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [notes, setNotes] = useState("");
  const [requireConfirmation, setRequireConfirmation] = useState(true);
  const [assignMode, setAssignMode] = useState<"my_cleaner" | "partner">("my_cleaner");
  const [partnerCompanyId, setPartnerCompanyId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sourceRequestId, setSourceRequestId] = useState<string | null>(null);

  // Prefill from client request (via sessionStorage)
  useEffect(() => {
    if (isEditing) return;
    const raw = sessionStorage.getItem("clientRequestPrefill");
    if (!raw) return;
    sessionStorage.removeItem("clientRequestPrefill");
    try {
      const prefill = JSON.parse(raw);
      if (prefill.scheduledDate) setScheduledDate(prefill.scheduledDate);
      if (prefill.notes) setNotes(prefill.notes);
      if (prefill.requestId) setSourceRequestId(prefill.requestId);
      if (prefill.propertyId) setPropertyId(prefill.propertyId);
    } catch {
      // ignore malformed data
    }
  }, [isEditing]);

  useEffect(() => {
    if (existing) {
      setPropertyId(existing.propertyId);
      setSelectedCleaners(existing.cleanerIds);
      setType(existing.type);
      setScheduledDate(existing.scheduledDate);
      setStartTime(existing.startTime ?? "");
      setDurationMinutes(existing.durationMinutes);
      setNotes(existing.notes ?? "");
    }
  }, [existing]);

  if (!user || properties === undefined || cleaners === undefined || maintenanceWorkers === undefined) return <PageLoader />;

  const isMaintenance = type === "maintenance";
  const workers = isMaintenance ? maintenanceWorkers : cleaners;
  const workerLabel = isMaintenance ? "Maintenance Workers" : "Cleaners";
  const emptyWorkerMsg = isMaintenance
    ? <>No active maintenance workers. <a href="/employees" className="text-primary-600">Invite workers first</a>.</>
    : <>No active cleaners. <a href="/employees" className="text-primary-600">Invite cleaners first</a>.</>;
  if (isEditing && existing === undefined) return <PageLoader />;

  const activeProperties = properties.filter((p) => p.active);

  const toggleCleaner = (id: string) => {
    setSelectedCleaners((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const isPartnerMode = !isEditing && assignMode === "partner";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const uid = requireUserId(user);
    if (!uid || !user!.companyId) return;
    if (isPartnerMode && !partnerCompanyId) {
      setError("Please select a partner company");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const data = {
        propertyId: propertyId as Id<"properties">,
        cleanerIds: (isPartnerMode ? [] : selectedCleaners) as Id<"users">[],
        type: type as any,
        scheduledDate,
        startTime: startTime || undefined,
        durationMinutes,
        notes: notes || undefined,
      };
      if (isEditing) {
        await updateJob({ jobId: params.id as Id<"jobs">, userId: uid, ...data });
        setLocation(`/jobs/${params.id}`);
      } else {
        const id = await createJob({
          companyId: user!.companyId,
          userId: uid,
          ...data,
          requireConfirmation: isPartnerMode ? false : requireConfirmation,
        });

        if (isPartnerMode) {
          await shareJobMut({
            userId: uid,
            jobId: id as Id<"jobs">,
            toCompanyId: partnerCompanyId as Id<"companies">,
            sharePackage: true,
          });
        }

        // Mark source client request as converted
        if (sourceRequestId) {
          await updateRequestStatus({
            requestId: sourceRequestId as Id<"clientRequests">,
            userId: uid,
            status: "converted",
          }).catch(() => {
            // non-blocking — job was created successfully
          });
        }

        setLocation(`/jobs/${id}`);
      }
    } catch (err: any) {
      setError(err.message || "Failed to save job");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader title={isEditing ? "Edit Job" : "Schedule Job"} />

      {!isEditing && activeProperties.length === 0 && (
        <div className="card mb-6 border-amber-200 bg-amber-50">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-amber-100 text-amber-600">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Create a property first</h3>
              <p className="text-sm text-gray-500 mt-1">
                Jobs are assigned to a property. Add your first property to start scheduling cleans and maintenance.
              </p>
              <Link href="/properties" className="btn-primary inline-block mt-3 text-sm px-4 py-2">
                Add a Property
              </Link>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className={`card space-y-4${!isEditing && activeProperties.length === 0 ? " opacity-50 pointer-events-none" : ""}`}>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Property</label>
          <select className="input-field" value={propertyId} onChange={(e) => setPropertyId(e.target.value)} required>
            <option value="">Select a property</option>
            {activeProperties.map((p) => (
              <option key={p._id} value={p._id}>{p.name} — {p.address}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Job Type</label>
          <select className="input-field" value={type} onChange={(e) => { setType(e.target.value); setSelectedCleaners([]); }}>
            {JOB_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input type="date" className="input-field" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
            <input type="time" className="input-field" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
          <input type="number" className="input-field" value={durationMinutes} onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 0)} min={15} step={15} required />
        </div>

        {/* Assignment mode toggle (create only) */}
        {!isEditing && connections && connections.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Assign To</label>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              <button
                type="button"
                onClick={() => { setAssignMode("my_cleaner"); setPartnerCompanyId(""); }}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  assignMode === "my_cleaner"
                    ? "bg-primary-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Users className="w-4 h-4" /> My {workerLabel}
              </button>
              <button
                type="button"
                onClick={() => { setAssignMode("partner"); setSelectedCleaners([]); }}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  assignMode === "partner"
                    ? "bg-primary-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Handshake className="w-4 h-4" /> Partner Company
              </button>
            </div>
          </div>
        )}

        {/* Partner company dropdown */}
        {isPartnerMode && connections && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Partner Company</label>
            <select
              className="input-field"
              value={partnerCompanyId}
              onChange={(e) => setPartnerCompanyId(e.target.value)}
              required
            >
              <option value="">Select a partner...</option>
              {connections.map((conn) => (
                <option key={conn._id} value={conn.companyId}>
                  {conn.companyName}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              The partner will receive the job and assign their own cleaners.
            </p>
          </div>
        )}

        {/* Cleaner assignment (my_cleaner mode or editing) */}
        {!isPartnerMode && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Assign {workerLabel}</label>
            {workers.length === 0 ? (
              <p className="text-sm text-gray-500">{emptyWorkerMsg}</p>
            ) : (
              <div className="space-y-2">
                {workers.map((c) => (
                  <label key={c._id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedCleaners.includes(c._id)}
                      onChange={() => toggleCleaner(c._id)}
                      className="w-4 h-4 text-primary-600 rounded border-gray-300"
                    />
                    <span className="text-sm">{c.name}</span>
                    <span className="text-xs text-gray-400">{c.email}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {!isPartnerMode && (
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={requireConfirmation}
                onChange={(e) => setRequireConfirmation(e.target.checked)}
                className="w-4 h-4 text-primary-600 rounded border-gray-300"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">Require cleaner confirmation</span>
                <p className="text-xs text-gray-400">When unchecked, job is auto-confirmed</p>
              </div>
            </label>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea className="input-field" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Special instructions for this job" />
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button type="button" onClick={() => setLocation(isEditing ? `/jobs/${params.id}` : "/jobs")} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={loading || !propertyId || (isPartnerMode && !partnerCompanyId)} className="btn-primary flex items-center gap-2">
            {loading && <LoadingSpinner size="sm" />}
            {isEditing ? "Save Changes" : isPartnerMode ? "Share to Partner" : "Schedule Job"}
          </button>
        </div>
      </form>
    </div>
  );
}
