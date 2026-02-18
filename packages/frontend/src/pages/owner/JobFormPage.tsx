import { useState, FormEvent, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader, LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useLocation, useParams } from "wouter";

const JOB_TYPES = [
  { value: "standard", label: "Standard Clean" },
  { value: "deep_clean", label: "Deep Clean" },
  { value: "turnover", label: "Turnover" },
  { value: "move_in_out", label: "Move In/Out" },
  { value: "maintenance", label: "Maintenance" },
] as const;

export function JobFormPage() {
  const { user, sessionToken } = useAuth();
  const [, setLocation] = useLocation();
  const params = useParams<{ id?: string }>();
  const isEditing = !!params.id;

  const properties = useQuery(
    api.queries.properties.list,
    sessionToken ? { sessionToken } : "skip"
  );
  const cleaners = useQuery(
    api.queries.employees.getCleaners,
    sessionToken ? { sessionToken } : "skip"
  );

  const existing = useQuery(
    api.queries.jobs.get,
    params.id && sessionToken ? { sessionToken, jobId: params.id as Id<"jobs"> } : "skip"
  );

  const createJob = useMutation(api.mutations.jobs.create);
  const updateJob = useMutation(api.mutations.jobs.update);

  const [propertyId, setPropertyId] = useState("");
  const [selectedCleaners, setSelectedCleaners] = useState<string[]>([]);
  const [type, setType] = useState("standard");
  const [scheduledDate, setScheduledDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [notes, setNotes] = useState("");
  const [requireConfirmation, setRequireConfirmation] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

  if (!user || properties === undefined || cleaners === undefined) return <PageLoader />;
  if (isEditing && existing === undefined) return <PageLoader />;

  const activeProperties = properties.filter((p) => p.active);

  const toggleCleaner = (id: string) => {
    setSelectedCleaners((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!sessionToken) return;
    setError("");
    setLoading(true);
    try {
      const data = {
        propertyId: propertyId as Id<"properties">,
        cleanerIds: selectedCleaners as Id<"users">[],
        type: type as any,
        scheduledDate,
        startTime: startTime || undefined,
        durationMinutes,
        notes: notes || undefined,
      };
      if (isEditing) {
        await updateJob({ sessionToken: sessionToken!, jobId: params.id as Id<"jobs">, ...data });
        setLocation(`/jobs/${params.id}`);
      } else {
        const id = await createJob({
          sessionToken: sessionToken!,
          ...data,
          requireConfirmation,
        });
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

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-4">
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
          <select className="input-field" value={type} onChange={(e) => setType(e.target.value)}>
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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Assign Cleaners</label>
          {cleaners.length === 0 ? (
            <p className="text-sm text-gray-500">No active cleaners. <a href="/employees" className="text-primary-600">Invite cleaners first</a>.</p>
          ) : (
            <div className="space-y-2">
              {cleaners.map((c) => (
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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea className="input-field" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Special instructions for this job" />
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button type="button" onClick={() => setLocation(isEditing ? `/jobs/${params.id}` : "/jobs")} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={loading || !propertyId} className="btn-primary flex items-center gap-2">
            {loading && <LoadingSpinner size="sm" />}
            {isEditing ? "Save Changes" : "Schedule Job"}
          </button>
        </div>
      </form>
    </div>
  );
}
