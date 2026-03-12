import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { JobTimeline } from "@/components/JobTimeline";
import { useTranslation } from "react-i18next";
import { useParams, Link } from "wouter";
import {
  Calendar,
  Clock,
  MapPin,
  Key,
  Users,
  ArrowLeft,
  FileText,
  Image,
  ClipboardCheck,
  Upload,
  X,
  AlertTriangle,
  Star,
  Flag,
} from "lucide-react";

export function ManagerJobDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const { t } = useTranslation();

  const jobId = params.id as Id<"jobs">;

  const job = useQuery(
    api.queries.jobs.get,
    user ? { jobId, userId: user._id } : "skip"
  );

  const inspections = useQuery(
    api.queries.inspections.getByJob,
    user && job ? { jobId, userId: user._id } : "skip"
  );

  const inspectionSummary = useQuery(
    api.queries.inspections.getSummary,
    user && job ? { jobId, userId: user._id } : "skip"
  );

  const submitInspection = useMutation(api.mutations.inspections.submit);
  const generateUploadUrl = useMutation(api.mutations.storage.generateUploadUrl);
  const resolveRedFlag = useMutation(api.mutations.redFlags.managerResolveRedFlag);
  const updateLifecycle = useMutation(api.mutations.redFlags.managerUpdateLifecycle);

  // Inspection form state
  const [showForm, setShowForm] = useState(false);
  const [score, setScore] = useState(7);
  const [severity, setSeverity] = useState<"none" | "low" | "medium" | "high" | "critical">("none");
  const [notes, setNotes] = useState("");
  const [issues, setIssues] = useState("");
  const [photoIds, setPhotoIds] = useState<Id<"_storage">[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resolvingFlag, setResolvingFlag] = useState<string | null>(null);
  const [resolveNote, setResolveNote] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  if (job === undefined) return <PageLoader />;
  if (job === null)
    return (
      <div className="text-center py-12 text-gray-500">{t("jobs.jobNotFound")}</div>
    );

  const acceptance = job.acceptanceStatus ?? "pending";
  const property = job.property ?? (job as any).propertySnapshot;

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !user) return;
    setUploading(true);
    try {
      for (const file of Array.from(e.target.files) as File[]) {
        const url = await generateUploadUrl({ userId: user._id });
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        const { storageId } = await res.json();
        setPhotoIds((prev: Id<"_storage">[]) => [...prev, storageId]);
      }
    } catch {
      setToast({ message: "Failed to upload photo", type: "error" });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      const issueList = issues
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      await submitInspection({
        userId: user._id,
        jobId,
        readinessScore: score,
        severity,
        notes: notes.trim() || undefined,
        issues: issueList.length > 0 ? issueList : undefined,
        photoStorageIds: photoIds.length > 0 ? photoIds : undefined,
      });
      setShowForm(false);
      setScore(7);
      setSeverity("none");
      setNotes("");
      setIssues("");
      setPhotoIds([]);
      setToast({ message: t("inspection.submitted"), type: "success" });
      setTimeout(() => setToast(null), 3000);
    } catch (err: any) {
      setToast({ message: err.message ?? t("common.failed"), type: "error" });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSubmitting(false);
    }
  };

  const severityColor = (sev: string) => {
    switch (sev) {
      case "critical": return "bg-red-100 text-red-700";
      case "high": return "bg-orange-100 text-orange-700";
      case "medium": return "bg-yellow-100 text-yellow-700";
      case "low": return "bg-blue-100 text-blue-700";
      case "none": return "bg-gray-100 text-gray-600";
      default: return "bg-green-100 text-green-700";
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm text-white ${toast.type === "success" ? "bg-green-600" : "bg-red-600"}`}>
          {toast.message}
        </div>
      )}

      <Link
        href="/jobs"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> {t("common.back")}
      </Link>

      <PageHeader title={property?.name ?? t("jobs.jobDetails")} />

      <div className="space-y-4">
        {/* Status & Type + Inspection Summary Badge */}
        <div className="card space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={job.status} />
            {acceptance !== "pending" && (
              <StatusBadge status={acceptance} />
            )}
            <span className="text-sm text-gray-500 capitalize">
              {job.type.replace(/_/g, " ")}
            </span>
            {inspectionSummary && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${severityColor(inspectionSummary.latestSeverity)}`}>
                <ClipboardCheck className="w-3 h-3" />
                {t("inspection.inspected")} {inspectionSummary.latestScore}/10
                {inspectionSummary.latestSeverity !== "none" && (
                  <Flag className="w-3 h-3" />
                )}
              </span>
            )}
          </div>

          {/* Schedule Info */}
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />{" "}
              {job.scheduledDate}
              {job.startTime && ` at ${job.startTime}`}
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />{" "}
              {job.durationMinutes} {t("common.minutes")}
            </div>
            {property?.address && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gray-400" />{" "}
                {property.address}
              </div>
            )}
          </div>

          {/* Access Instructions */}
          {property?.accessInstructions && (
            <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <p className="text-sm font-medium text-yellow-800 flex items-center gap-1">
                <Key className="w-4 h-4" /> {t("jobs.accessInstructions")}
              </p>
              <p className="text-sm text-yellow-700 mt-1">
                {property.accessInstructions}
              </p>
            </div>
          )}

          {/* Notes */}
          {job.notes && (
            <p className="text-sm text-gray-600 border-t pt-3">
              {job.notes}
            </p>
          )}
        </div>

        {/* Assigned Cleaners */}
        {job.cleaners.length > 0 && (
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <Users className="w-4 h-4" /> {t("inspection.assignedCleaners")}
            </h3>
            <div className="space-y-1">
              {job.cleaners.map((c) => (
                <div key={c!._id} className="text-sm text-gray-600">
                  {c!.name}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Timeline */}
        <JobTimeline job={job as any} />

        {/* Form Submission Info */}
        {job.form && (
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4" /> {t("inspection.formSubmission")}
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-500">{t("inspection.statusLabel")}</span>
                <StatusBadge
                  status={job.form.status}
                  className="text-[10px]"
                />
              </div>
              {job.form.cleanerScore !== undefined && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">{t("inspection.cleanerScore")}</span>
                  <span className="font-medium">
                    {job.form.cleanerScore}%
                  </span>
                </div>
              )}
              {job.form.finalPass !== undefined && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">{t("inspection.finalPass")}</span>
                  <span
                    className={
                      job.form.finalPass
                        ? "text-green-600 font-medium"
                        : "text-red-600 font-medium"
                    }
                  >
                    {job.form.finalPass ? "Yes" : "No"}
                  </span>
                </div>
              )}
              {/* Photos */}
              {job.form.photoUrls && job.form.photoUrls.length > 0 && (
                <div>
                  <p className="text-gray-500 flex items-center gap-1 mb-2">
                    <Image className="w-3.5 h-3.5" />{" "}
                    {job.form.photoUrls.length} {t("inspection.photoCount", { count: job.form.photoUrls.length })}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {job.form.photoUrls.map((url: string, i: number) => (
                      <img
                        key={i}
                        src={url}
                        alt={`Job photo ${i + 1}`}
                        className="w-full h-24 object-cover rounded-lg border"
                      />
                    ))}
                  </div>
                </div>
              )}
              {/* Rework notes */}
              {job.form.ownerNotes && (
                <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                  <p className="text-sm font-medium text-orange-800">
                    {t("inspection.reworkNotes")}
                  </p>
                  <p className="text-sm text-orange-700 mt-1">
                    {job.form.ownerNotes}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Inspection Action ──────────────────────────────────── */}
        {inspectionSummary && !inspectionSummary.inspectionCycleOpen && (
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-center">
            <p className="text-sm text-gray-600 flex items-center justify-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-gray-400" />
              {t("inspection.cycleClosed")}
            </p>
          </div>
        )}
        {(!inspectionSummary || inspectionSummary.inspectionCycleOpen) && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            <ClipboardCheck className="w-4 h-4" /> {t("inspection.submitHouseCheck")}
          </button>
        )}

        {/* ── Inspection Form ──────────────────────────────────── */}
        {showForm && (
          <div className="card border-blue-200">
            <h3 className="font-semibold text-blue-700 flex items-center gap-2 mb-4">
              <ClipboardCheck className="w-5 h-5" /> {t("inspection.houseCheck")}
            </h3>

            <div className="space-y-4">
              {/* Readiness Score */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("inspection.readinessScore")}
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={score}
                    onChange={(e) => setScore(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="flex items-center gap-1 text-lg font-bold text-blue-700 min-w-[3rem] justify-center">
                    <Star className="w-4 h-4" /> {score}/10
                  </span>
                </div>
              </div>

              {/* Red Flags */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("inspection.redFlags")}
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  {t("inspection.redFlagsHelper")}
                </p>
                <div className="flex gap-2 flex-wrap">
                  {(["none", "low", "medium", "high", "critical"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSeverity(s)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        severity === s
                          ? severityColor(s) + " border-current"
                          : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                      }`}
                    >
                      {t(`severity.${s}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("inspection.notes")}
                </label>
                <textarea
                  className="input-field"
                  rows={3}
                  placeholder={t("inspection.notesPlaceholder")}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {/* Issues */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("inspection.issues")}
                </label>
                <textarea
                  className="input-field"
                  rows={3}
                  placeholder={t("inspection.issuesPlaceholder")}
                  value={issues}
                  onChange={(e) => setIssues(e.target.value)}
                />
              </div>

              {/* Photos */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("inspection.photos")}
                </label>
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-300 cursor-pointer hover:bg-gray-50 text-sm text-gray-600">
                  <Upload className="w-4 h-4" />
                  {uploading ? t("inspection.uploading") : t("inspection.addPhotos")}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handlePhotoUpload}
                    disabled={uploading}
                  />
                </label>
                {photoIds.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    {photoIds.length} {t("inspection.photosAttached")}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowForm(false);
                    setPhotoIds([]);
                  }}
                  className="btn-secondary flex-1"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  <ClipboardCheck className="w-4 h-4" />
                  {submitting ? t("common.saving") : t("inspection.submit")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Cleaner Red Flags ──────────────────────────────── */}
        {job.redFlags && job.redFlags.length > 0 && (
          <div className="card border-red-200">
            <h3 className="text-sm font-semibold text-red-700 mb-3 flex items-center gap-2">
              <Flag className="w-4 h-4" /> {t("inspection.cleanerRedFlags")} ({job.redFlags.length})
            </h3>
            <div className="space-y-2">
              {job.redFlags.map((flag: any) => (
                <div key={flag._id} className="p-2.5 rounded-lg bg-red-50 border border-red-100">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${severityColor(flag.severity)}`}>
                      {t(`severity.${flag.severity}`)}
                    </span>
                    <span className="text-xs font-medium capitalize text-gray-600">{flag.category}</span>
                    <StatusBadge status={flag.status} className="text-[10px]" />
                  </div>
                  <p className="text-sm text-gray-700">{flag.note}</p>
                  {/* Manager lifecycle actions */}
                  {user && (user as any).canResolveRedFlags && flag.status !== "resolved" && flag.status !== "wont_fix" && (
                    <div className="mt-2">
                      {resolvingFlag === flag._id ? (
                        <div className="flex gap-2 items-center">
                          <input
                            type="text"
                            className="input-field text-sm flex-1"
                            placeholder={t("inspection.resolveNotePlaceholder")}
                            value={resolveNote}
                            onChange={(e) => setResolveNote(e.target.value)}
                            autoFocus
                          />
                          <button
                            className="btn-primary text-xs px-2 py-1"
                            onClick={async () => {
                              try {
                                await resolveRedFlag({ flagId: flag._id, userId: user._id, note: resolveNote.trim() || undefined });
                                setResolvingFlag(null);
                                setResolveNote("");
                                setToast({ message: t("inspection.flagResolved"), type: "success" });
                                setTimeout(() => setToast(null), 3000);
                              } catch (err: any) {
                                setToast({ message: err.message ?? t("common.failed"), type: "error" });
                                setTimeout(() => setToast(null), 3000);
                              }
                            }}
                          >
                            {t("common.confirm")}
                          </button>
                          <button className="btn-secondary text-xs px-2 py-1" onClick={() => { setResolvingFlag(null); setResolveNote(""); }}>
                            {t("common.cancel")}
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2 items-center flex-wrap">
                          {flag.status !== "in_progress" && (
                            <button
                              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                              onClick={async () => {
                                try {
                                  await updateLifecycle({ flagId: flag._id, userId: user._id, status: "in_progress" });
                                  setToast({ message: t("redFlags.markedInProgress"), type: "success" });
                                  setTimeout(() => setToast(null), 3000);
                                } catch (err: any) {
                                  setToast({ message: err.message ?? t("common.failed"), type: "error" });
                                  setTimeout(() => setToast(null), 3000);
                                }
                              }}
                            >
                              {t("redFlags.markInProgress")}
                            </button>
                          )}
                          <button
                            className="text-xs text-green-600 hover:text-green-700 font-medium"
                            onClick={() => setResolvingFlag(flag._id)}
                          >
                            {t("inspection.resolveFlag")}
                          </button>
                          <button
                            className="text-xs text-gray-500 hover:text-gray-600 font-medium"
                            onClick={async () => {
                              try {
                                await updateLifecycle({ flagId: flag._id, userId: user._id, status: "wont_fix" });
                                setToast({ message: t("redFlags.markedWontFix"), type: "success" });
                                setTimeout(() => setToast(null), 3000);
                              } catch (err: any) {
                                setToast({ message: err.message ?? t("common.failed"), type: "error" });
                                setTimeout(() => setToast(null), 3000);
                              }
                            }}
                          >
                            {t("redFlags.wontFix")}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Inspection History ──────────────────────────────── */}
        {inspections && inspections.length > 0 && (
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4" /> {t("inspection.history")} ({inspections.length})
            </h3>
            <div className="space-y-3">
              {inspections.map((ins) => (
                <div
                  key={ins._id}
                  className="p-3 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {ins.managerName}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${severityColor(ins.severity)}`}>
                        <Flag className="w-3 h-3" />
                        {t(`severity.${ins.severity}`)}
                      </span>
                    </div>
                    <span className="flex items-center gap-1 text-sm font-bold text-blue-700">
                      <Star className="w-3.5 h-3.5" /> {ins.readinessScore}/10
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mb-2">
                    {new Date(ins.createdAt).toLocaleString()}
                  </p>
                  {ins.notes && (
                    <p className="text-sm text-gray-600 mb-2">{ins.notes}</p>
                  )}
                  {ins.issues && ins.issues.length > 0 && (
                    <div className="mb-2">
                      <p className="text-xs font-medium text-gray-500 mb-1">
                        {t("inspection.issuesFound")}
                      </p>
                      <ul className="space-y-1">
                        {ins.issues.map((issue: string, idx: number) => (
                          <li
                            key={idx}
                            className="text-sm text-gray-600 flex items-start gap-1.5"
                          >
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                            {issue}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {ins.photoUrls && ins.photoUrls.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {ins.photoUrls.map((url: string, i: number) => (
                        <img
                          key={i}
                          src={url}
                          alt={`Inspection photo ${i + 1}`}
                          className="w-full h-20 object-cover rounded-lg border"
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
