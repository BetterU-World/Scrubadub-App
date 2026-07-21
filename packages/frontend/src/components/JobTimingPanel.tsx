import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { Pause, Play, Timer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { getStaffSessionToken } from "@/hooks/useAuth";
import { AsyncButton } from "@/components/ui/AsyncButton";
import { DialogShell } from "@/components/ui/DialogShell";

type PauseReason = "break" | "waiting_for_access" | "supplies" | "client_interruption" | "travel_between_service_areas" | "equipment_issue" | "other";
type PauseRecord = { pausedAt: number; resumedAt?: number; durationMs?: number; reason: PauseReason; note?: string; pausedByUserId: Id<"users">; resumedByUserId?: Id<"users"> };
type TimingJob = { _id: Id<"jobs">; status: string; startedAt?: number; completedAt?: number; cancelledAt?: number; currentPauseStartedAt?: number; pauseHistory?: PauseRecord[]; cleaners?: Array<{ _id: Id<"users">; name: string }>; assignedTeamMembers?: Array<{ _id: Id<"users">; name: string }>; assignedManagerName?: string | null };

const reasons: PauseReason[] = ["break", "waiting_for_access", "supplies", "client_interruption", "travel_between_service_areas", "equipment_issue", "other"];

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function timing(job: TimingJob, now: number) {
  if (!job.startedAt) return { elapsed: 0, paused: 0, active: 0, currentPause: 0 };
  const end = job.completedAt ?? job.cancelledAt ?? now;
  const elapsed = Math.max(0, end - job.startedAt);
  const paused = (job.pauseHistory ?? []).reduce((sum, p) => sum + (p.durationMs ?? (p.resumedAt ? Math.max(0, p.resumedAt - p.pausedAt) : Math.max(0, end - p.pausedAt))), 0);
  return { elapsed, paused, active: Math.max(0, elapsed - paused), currentPause: job.currentPauseStartedAt ? Math.max(0, end - job.currentPauseStartedAt) : 0 };
}

export function JobTimingPanel({ job, userId, controls = false, ownerMode = false }: { job: TimingJob; userId?: Id<"users">; controls?: boolean; ownerMode?: boolean }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now());
  const [showPause, setShowPause] = useState(false);
  const [reason, setReason] = useState<PauseReason>("break");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const pauseJob = useMutation(api.mutations.jobs.pauseJob);
  const resumeJob = useMutation(api.mutations.jobs.resumeJob);
  const ownerPauseJob = useMutation(api.mutations.jobs.ownerPauseJob);
  const ownerResumeJob = useMutation(api.mutations.jobs.ownerResumeJob);

  useEffect(() => {
    if (!job.startedAt || job.completedAt || job.cancelledAt) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [job.startedAt, job.completedAt, job.cancelledAt]);

  const values = timing(job, now);
  const actorNames = useMemo(() => new Map([...(job.cleaners ?? []), ...(job.assignedTeamMembers ?? [])].map((u) => [String(u._id), u.name])), [job.cleaners, job.assignedTeamMembers]);
  if (!job.startedAt) return null;
  const paused = job.currentPauseStartedAt !== undefined;
  const canControl = controls && !!userId && job.status === "in_progress";

  const handlePause = async () => {
    if (!userId) return;
    setPending(true);
    try {
      const args = { jobId: job._id, reason, note: note.trim() || undefined, userId, sessionToken: getStaffSessionToken() };
      if (ownerMode) await ownerPauseJob(args); else await pauseJob(args);
      setShowPause(false); setNote(""); setReason("break");
    } finally { setPending(false); }
  };
  const handleResume = async () => {
    if (!userId) return;
    setPending(true);
    try {
      const args = { jobId: job._id, userId, sessionToken: getStaffSessionToken() };
      if (ownerMode) await ownerResumeJob(args); else await resumeJob(args);
    } finally { setPending(false); }
  };

  return <>
    <section className={`card space-y-3 ${paused ? "border-amber-300 bg-amber-50" : ""}`} aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold flex items-center gap-2"><Timer className="w-5 h-5" /> {t("jobTimer.title")}</h3>
        {paused && <span className="badge bg-amber-200 text-amber-900">{t("jobTimer.paused")}</span>}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div><p className="text-xs text-gray-500">{t("jobTimer.active")}</p><p className="font-semibold tabular-nums">{formatDuration(values.active)}</p></div>
        <div><p className="text-xs text-gray-500">{t("jobTimer.pausedTime")}</p><p className="font-semibold tabular-nums">{formatDuration(values.paused)}</p></div>
        <div><p className="text-xs text-gray-500">{t("jobTimer.elapsed")}</p><p className="font-semibold tabular-nums">{formatDuration(values.elapsed)}</p></div>
      </div>
      {paused && <p className="text-sm text-amber-800">{t("jobTimer.pausedFor", { duration: formatDuration(values.currentPause) })}</p>}
      {canControl && (paused ?
        <AsyncButton pending={pending} pendingLabel={t("jobTimer.resuming")} onClick={handleResume} className="btn-primary w-full flex items-center justify-center gap-2"><Play className="w-4 h-4" /> {t("jobTimer.resume")}</AsyncButton> :
        <button onClick={() => setShowPause(true)} className="btn-secondary touch-target w-full flex items-center justify-center gap-2"><Pause className="w-4 h-4" /> {t("jobTimer.pause")}</button>)}
      {(job.pauseHistory?.length ?? 0) > 0 && <details className="text-sm"><summary className="cursor-pointer font-medium">{t("jobTimer.history")}</summary><div className="mt-2 space-y-2">{job.pauseHistory!.slice().reverse().map((p) => <div key={p.pausedAt} className="border-t pt-2 text-gray-600"><p>{t(`jobTimer.reasons.${p.reason}`)}{p.note ? ` — ${p.note}` : ""}</p><p className="text-xs">{new Date(p.pausedAt).toLocaleString()} · {p.resumedAt ? formatDuration(p.durationMs ?? p.resumedAt - p.pausedAt) : t("jobTimer.inProgress")}{actorNames.get(String(p.pausedByUserId)) ? ` · ${actorNames.get(String(p.pausedByUserId))}` : ""}</p></div>)}</div></details>}
    </section>
    <DialogShell open={showPause} onOpenChange={setShowPause} title={t("jobTimer.pauseTitle")} pending={pending}>
      <label className="block text-sm font-medium mb-1" htmlFor="pause-reason">{t("jobTimer.reason")}</label>
      <select id="pause-reason" className="input-field mb-3" value={reason} onChange={(e) => setReason(e.target.value as PauseReason)}>{reasons.map((value) => <option key={value} value={value}>{t(`jobTimer.reasons.${value}`)}</option>)}</select>
      {reason === "other" && <><label className="block text-sm font-medium mb-1" htmlFor="pause-note">{t("jobTimer.otherNote")}</label><textarea id="pause-note" className="input-field mb-3" maxLength={200} rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3"><button className="btn-secondary touch-target" onClick={() => setShowPause(false)}>{t("common.cancel")}</button><AsyncButton pending={pending} pendingLabel={t("jobTimer.pausing")} disabled={reason === "other" && !note.trim()} onClick={handlePause} className="btn-primary touch-target">{t("jobTimer.pause")}</AsyncButton></div>
    </DialogShell>
  </>;
}
