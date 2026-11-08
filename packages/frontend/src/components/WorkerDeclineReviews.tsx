import { useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useTranslation } from "react-i18next";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { getStaffSessionToken, useAuth } from "@/hooks/useAuth";
import { AsyncButton } from "./ui/AsyncButton";

type WorkerState = FunctionReturnType<typeof api.workerDeclineReviews.workerState>;

export function useWorkerDeclineState(job: { _id: Id<"jobs">; canCurrentUserExecute?: boolean } | null | undefined) {
  const { user } = useAuth();
  return useQuery(api.workerDeclineReviews.workerState, user && job?.canCurrentUserExecute
    ? { jobId: job._id, userId: user._id, sessionToken: getStaffSessionToken() } : "skip");
}

export function WorkerDeclineStatus({ state }: { state: WorkerState | undefined }) {
  const { t } = useTranslation();
  if (!state?.latest) return null;
  return <div className="card space-y-2 break-words" role="status">
    <p className="font-medium">{t(`workerReview.${state.latest.status}`)}</p>
    <p className="text-sm text-gray-600">{t(state.latest.status === "pending" ? "workerReview.pendingWorkerHelp" : "workerReview.resolvedWorkerHelp")}</p>
    {state.latest.reason && <p className="whitespace-pre-wrap text-sm">{state.latest.reason}</p>}
  </div>;
}

export function WorkerDeclineReviews({ jobId }: { jobId: Id<"jobs"> }) {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const allowed = user?.role === "owner" || (user?.role === "manager" && (user.canAssignCleaners || user.canManageSchedule));
  const { results, status, loadMore } = usePaginatedQuery(api.workerDeclineReviews.forJob,
    user && allowed ? { jobId, userId: user._id, sessionToken: getStaffSessionToken() } : "skip", { initialNumItems: 10 });
  const resolve = useMutation(api.workerDeclineReviews.resolve);
  const [saving, setSaving] = useState<Id<"workerDeclineReviews"> | null>(null);
  const [feedback, setFeedback] = useState<"resolvedHelp" | "failedResolve" | null>(null);
  if (!allowed) return null;
  return <section className="card space-y-3 min-w-0" aria-label={t("workerReview.title")}>
    <h2 className="font-semibold">{t("workerReview.title")}</h2>
    <p className="text-sm text-gray-600">{t("workerReview.staffHelp")}</p>
    {feedback && <p role={feedback === "failedResolve" ? "alert" : "status"} className="text-sm">{t(`workerReview.${feedback}`)}</p>}
    {status === "LoadingFirstPage" && <p role="status">{t("common.loading")}</p>}
    {status !== "LoadingFirstPage" && results.length === 0 && <p className="text-sm text-gray-500">{t("workerReview.empty")}</p>}
    {results.map(review => <article key={review._id} className="rounded-lg border border-gray-200 p-3 space-y-2 min-w-0 break-words">
      <div className="flex flex-wrap justify-between gap-2">
        <p className="font-medium">{review.workerName}</p>
        <span className="text-sm">{t(`workerReview.${review.status}`)}</span>
      </div>
      <p className="text-sm">{t(`workerReview.${review.kind}`)} · {new Date(review.requestedAt).toLocaleString(i18n.language)}</p>
      {review.reason && <p className="whitespace-pre-wrap text-sm">{review.reason}</p>}
      {review.status === "pending" ? <AsyncButton pending={saving === review._id} disabled={saving !== null}
        pendingLabel={t("common.processing")} className="btn-secondary w-full sm:w-auto"
        onClick={async () => {
          if (!user) return;
          setSaving(review._id); setFeedback(null);
          try { await resolve({ reviewId: review._id, userId: user._id, sessionToken: getStaffSessionToken() }); setFeedback("resolvedHelp"); }
          catch { setFeedback("failedResolve"); }
          finally { setSaving(null); }
        }}>{t("workerReview.resolve")}</AsyncButton>
        : <p className="text-xs text-gray-500">{t("workerReview.resolvedBy", { name: review.resolvedByName ?? "", date: review.resolvedAt ? new Date(review.resolvedAt).toLocaleString(i18n.language) : "" })}</p>}
    </article>)}
    {(status === "CanLoadMore" || status === "LoadingMore") && <AsyncButton className="btn-secondary w-full sm:w-auto"
      pending={status === "LoadingMore"} pendingLabel={t("common.loading")} onClick={() => loadMore(10)}>{t("workerReview.loadMore")}</AsyncButton>}
  </section>;
}
