import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "../../hooks/useAuth";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageLoader } from "../../components/ui/LoadingSpinner";
import { ASSESSMENT_CLEANUP_CONFIRMATION, approvedIdsFromLatestDryRun, canConfirmAssessmentCleanup } from "./assessmentCleanupUi";

const CONFIRMATION = ASSESSMENT_CLEANUP_CONFIRMATION;
const cleanupApi = (api as any).mutations.assessmentDuplicateCleanup.cleanup;

type Funnel = { starts: number; completed: number; inProgress: number; abandoned: number };
type DeletionCounts = {
  assessmentAttempts: number; assessmentResponses: number; assessmentEvents: number;
  assessmentProspects: number; assessmentReportTokens: number; rateLimits: number;
};
type AttemptRow = {
  attemptId: Id<"assessmentAttempts">;
  status: string;
  creationTime: number;
  startedAt: number;
  lastActivityAt: number;
  distinctResponseCount: number;
  storedProgress: { requiredAnsweredCount: number | null; requiredApplicableCount: number | null; optionalAnsweredCount: number | null };
  responseModified: boolean;
  progressEventCount: number;
  resumeEventCount: number;
  hasProspect: boolean;
  hasEmail: boolean;
  hasCompletionSnapshot: boolean;
  hasReportSnapshot: boolean;
  hasRoadmapSnapshot: boolean;
  hasReportToken: boolean;
  browserGroupSize: number;
  capabilityGroupSize: number;
  dependents: { responses: number; events: number; prospects: number; reportTokens: number; rateLimits: number };
  classification: string;
  reason: string;
};
export type CleanupDryRun = {
  mode: "dry_run";
  totalAssessmentRecords: number;
  blocked: boolean;
  blockingReasons: string[];
  meaningfulInProgressCandidateIds: Id<"assessmentAttempts">[];
  remainingMeaningfulInProgressAttemptId: Id<"assessmentAttempts"> | null;
  preservedIds: Id<"assessmentAttempts">[];
  proposedDeletionIds: Id<"assessmentAttempts">[];
  currentFunnel: Funnel;
  projectedFunnel: Funnel;
  projectedDeletionCounts: DeletionCounts;
  attempts: AttemptRow[];
};
export type CleanupResult = {
  mode: "confirmed";
  deletedAttemptIds: Id<"assessmentAttempts">[];
  preservedAttemptIds: Id<"assessmentAttempts">[];
  deletedCounts: DeletionCounts;
  finalFunnel: Funnel;
  remainingMeaningfulInProgressAttemptId: Id<"assessmentAttempts"> | null;
  protectedRecordsDeleted: boolean;
};

export function AssessmentCleanupPage() {
  const { user, sessionToken, isLoading } = useAuth();
  const canAccess = user?.isSuperadmin === true && Boolean(sessionToken);
  const cleanup = useMutation(cleanupApi);
  const [dryRun, setDryRun] = useState<CleanupDryRun | null>(null);
  const [result, setResult] = useState<CleanupResult | null>(null);
  const [selectedSurvivor, setSelectedSurvivor] = useState<Id<"assessmentAttempts"> | "">("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  if (isLoading) return <PageLoader />;
  if (!canAccess) return null;

  async function runDryRun() {
    setBusy(true); setError(""); setResult(null); setConfirmation(""); setCopied(false);
    try {
      const next = await cleanup({
        mode: "dry_run",
        userId: user!._id,
        sessionToken,
        preserveInProgressAttemptId: selectedSurvivor || undefined,
      }) as CleanupDryRun;
      setDryRun(next);
    } catch (caught) {
      setDryRun(null);
      setError(caught instanceof Error ? caught.message : "Assessment cleanup dry run failed");
    } finally { setBusy(false); }
  }

  async function confirmCleanup() {
    if (!canConfirmAssessmentCleanup(dryRun, confirmation)) return;
    const approvedAttemptIds = approvedIdsFromLatestDryRun(dryRun!);
    const counts = dryRun!.projectedDeletionCounts;
    const accepted = window.confirm(
      `Delete ${approvedAttemptIds.length} duplicate assessment attempts?\n\n` +
      `Projected final funnel: ${formatFunnel(dryRun!.projectedFunnel)}\n` +
      `Dependent records: ${counts.assessmentResponses} responses, ${counts.assessmentEvents} events, ` +
      `${counts.assessmentProspects} prospects, ${counts.assessmentReportTokens} report tokens, ${counts.rateLimits} rate limits.`
    );
    if (!accepted) return;
    setBusy(true); setError("");
    try {
      const completed = await cleanup({
        mode: "confirmed",
        userId: user!._id,
        sessionToken,
        preserveInProgressAttemptId: selectedSurvivor || undefined,
        confirm: CONFIRMATION,
        approvedAttemptIds,
      }) as CleanupResult;
      setResult(completed);
      setDryRun(null);
      setConfirmation("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Assessment cleanup failed. Run a fresh dry run before retrying.");
    } finally { setBusy(false); }
  }

  async function copyJson() {
    if (!dryRun) return;
    await navigator.clipboard.writeText(JSON.stringify(dryRun, null, 2));
    setCopied(true);
  }

  const proposed = new Set(dryRun?.proposedDeletionIds.map(String) ?? []);
  const survivors = dryRun?.attempts.filter((attempt) => !proposed.has(String(attempt.attemptId))) ?? [];
  const deletions = dryRun?.attempts.filter((attempt) => proposed.has(String(attempt.attemptId))) ?? [];
  const canConfirm = canConfirmAssessmentCleanup(dryRun, confirmation);

  return <div className="min-w-0">
    <PageHeader title="Temporary assessment cleanup" description="Founder-only historical duplicate assessment cleanup. Remove this page after production cleanup." back={{ href: "/admin", label: "Back to Super Admin" }} />
    <section className="card border-amber-300 bg-amber-50">
      <h2 className="font-semibold text-amber-950">Dry run required</h2>
      <p className="mt-2 text-sm text-amber-900">No cleanup runs automatically. Review a current dry run before entering the destructive confirmation phrase.</p>
      <button type="button" className="btn-secondary mt-4" disabled={busy} onClick={runDryRun}>Run assessment cleanup dry run</button>
    </section>

    {error && <div role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</div>}

    {dryRun && <div className="mt-8 space-y-6">
      <section className="grid gap-4 sm:grid-cols-2">
        <FunnelCard title="Current funnel" funnel={dryRun.currentFunnel} />
        <FunnelCard title="Projected funnel" funnel={dryRun.projectedFunnel} />
      </section>

      <section className={`card ${dryRun.blocked ? "border-red-300 bg-red-50" : "border-emerald-300 bg-emerald-50"}`}>
        <h2 className="font-semibold">Cleanup {dryRun.blocked ? "blocked" : "ready for review"}</h2>
        {dryRun.blockingReasons.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{dryRun.blockingReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
        <p className="mt-3 text-sm"><strong>Proposed deletions:</strong> {dryRun.proposedDeletionIds.length}</p>
      </section>

      {dryRun.meaningfulInProgressCandidateIds.length > 1 && <section className="card">
        <h2 className="font-semibold">Select the legitimate unfinished assessment</h2>
        <p className="mt-2 text-sm text-gray-600">Select only after manually reviewing the candidates, then rerun the dry run.</p>
        <select className="input-field mt-3" value={selectedSurvivor} onChange={(event) => setSelectedSurvivor(event.target.value as Id<"assessmentAttempts">)}>
          <option value="">Choose a reviewed survivor</option>
          {dryRun.meaningfulInProgressCandidateIds.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
        <button type="button" className="btn-secondary mt-3" disabled={!selectedSurvivor || busy} onClick={runDryRun}>Rerun with selected survivor</button>
      </section>}

      <IdSection title="Preserved attempt IDs" ids={dryRun.preservedIds} />
      <IdSection title="Meaningful in-progress candidates" ids={dryRun.meaningfulInProgressCandidateIds} />
      <IdSection title="Proposed deletion IDs" ids={dryRun.proposedDeletionIds} />
      <DeletionCountsCard title="Projected dependent-record deletions" counts={dryRun.projectedDeletionCounts} />
      <AttemptSection title="Surviving assessments" attempts={survivors} />
      <AttemptSection title="Proposed deletions" attempts={deletions} />

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Copyable dry-run JSON</h2><button type="button" className="btn-secondary" onClick={copyJson}>{copied ? "Copied" : "Copy JSON"}</button></div>
        <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-gray-950 p-4 text-xs text-gray-100">{JSON.stringify(dryRun, null, 2)}</pre>
      </section>

      <section className="card border-red-300">
        <h2 className="font-semibold text-red-900">Confirmed cleanup</h2>
        <p className="mt-2 text-sm text-gray-700">Type <code>{CONFIRMATION}</code> exactly. The approved IDs will come directly from this dry run.</p>
        <input aria-label="Assessment cleanup confirmation" className="input-field mt-3 font-mono" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={dryRun.blocked || busy} autoComplete="off" />
        <button type="button" className="mt-3 rounded-lg bg-red-700 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={!canConfirm || busy} onClick={confirmCleanup}>Review and confirm duplicate deletion</button>
      </section>
    </div>}

    {result && <CleanupResultSummary result={result} />}
  </div>;
}

export function CleanupResultSummary({ result }: { result: CleanupResult }) {
  return <section className="card mt-8 border-emerald-300 bg-emerald-50">
      <h2 className="text-lg font-semibold text-emerald-950">Assessment cleanup completed</h2>
      <p className="mt-2 text-sm">Protected attempts deleted: <strong>{result.protectedRecordsDeleted ? "YES — investigate" : "No"}</strong></p>
      <FunnelCard title="Final funnel" funnel={result.finalFunnel} />
      <IdSection title="Deleted attempt IDs" ids={result.deletedAttemptIds} />
      <IdSection title="Preserved attempt IDs" ids={result.preservedAttemptIds} />
      <DeletionCountsCard title="Deleted records" counts={result.deletedCounts} />
    </section>;
}

function formatFunnel(funnel: Funnel) { return `${funnel.starts} starts / ${funnel.completed} completed / ${funnel.inProgress} in progress / ${funnel.abandoned} abandoned`; }
function FunnelCard({ title, funnel }: { title: string; funnel: Funnel }) { return <section className="card"><h2 className="font-semibold">{title}</h2><p className="mt-2 text-sm">{formatFunnel(funnel)}</p></section>; }
function IdSection({ title, ids }: { title: string; ids: Id<"assessmentAttempts">[] }) { return <section className="card"><h2 className="font-semibold">{title} ({ids.length})</h2>{ids.length ? <ul className="mt-3 space-y-1 font-mono text-xs">{ids.map((id) => <li className="break-all" key={id}>{id}</li>)}</ul> : <p className="mt-2 text-sm text-gray-500">None</p>}</section>; }
function DeletionCountsCard({ title, counts }: { title: string; counts: DeletionCounts }) { return <section className="card"><h2 className="font-semibold">{title}</h2><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">{Object.entries(counts).map(([key, value]) => <div key={key}><dt className="text-gray-500">{key}</dt><dd className="font-semibold">{value}</dd></div>)}</dl></section>; }
function AttemptSection({ title, attempts }: { title: string; attempts: AttemptRow[] }) { return <section><h2 className="text-lg font-semibold">{title} ({attempts.length})</h2><div className="mt-3 space-y-3">{attempts.map((attempt) => <article className="card" key={attempt.attemptId}><div className="flex flex-wrap items-start justify-between gap-2"><code className="break-all text-xs">{attempt.attemptId}</code><span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold">{attempt.status}</span></div><p className="mt-3 text-sm font-medium">{attempt.reason}</p><dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4"><Fact label="Created" value={new Date(attempt.creationTime).toLocaleString()} /><Fact label="Started" value={new Date(attempt.startedAt).toLocaleString()} /><Fact label="Last activity" value={new Date(attempt.lastActivityAt).toLocaleString()} /><Fact label="Distinct responses" value={attempt.distinctResponseCount} /><Fact label="Required progress" value={`${attempt.storedProgress.requiredAnsweredCount ?? "?"}/${attempt.storedProgress.requiredApplicableCount ?? "?"}`} /><Fact label="Optional responses" value={attempt.storedProgress.optionalAnsweredCount ?? "?"} /><Fact label="Progress events" value={attempt.progressEventCount} /><Fact label="Resume events" value={attempt.resumeEventCount} /><Fact label="Response modified" value={attempt.responseModified ? "Yes" : "No"} /><Fact label="Contact/email" value={attempt.hasProspect ? (attempt.hasEmail ? "Present" : "Contact without email") : "None"} /><Fact label="Result snapshots" value={[attempt.hasCompletionSnapshot && "completion", attempt.hasReportSnapshot && "report", attempt.hasRoadmapSnapshot && "roadmap"].filter(Boolean).join(", ") || "None"} /><Fact label="Report token" value={attempt.hasReportToken ? "Present" : "None"} /><Fact label="Browser group" value={attempt.browserGroupSize} /><Fact label="Capability group" value={attempt.capabilityGroupSize} /><Fact label="Dependent records" value={Object.values(attempt.dependents).reduce((sum, value) => sum + value, 0)} /><Fact label="Classification" value={attempt.classification} /></dl></article>)}</div></section>; }
function Fact({ label, value }: { label: string; value: string | number }) { return <div><dt className="text-gray-500">{label}</dt><dd className="mt-1 break-words font-medium text-gray-900">{value}</dd></div>; }
