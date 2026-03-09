import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  MessageSquare,
  Star,
  Mail,
  User,
  CheckCircle,
  FileText,
  Globe,
} from "lucide-react";
import { useTranslation } from "react-i18next";

function useTimeAgo() {
  const { t } = useTranslation();
  return (ts: number): string => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t("time.justNow");
    if (mins < 60) return t("time.minutesAgo", { count: mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t("time.hoursAgo", { count: hrs });
    const days = Math.floor(hrs / 24);
    return t("time.daysAgo", { count: days });
  };
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`w-4 h-4 ${
            s <= rating
              ? "fill-yellow-400 text-yellow-400"
              : "text-gray-300"
          }`}
        />
      ))}
    </div>
  );
}

export function FeedbackInboxPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const timeAgo = useTimeAgo();
  const [statusFilter, setStatusFilter] = useState("");

  const statusOptions = [
    { value: "", label: t("requests.all") },
    { value: "new", label: t("status.new") },
    { value: "reviewed", label: t("status.reviewed") },
  ];

  const feedback = useQuery(
    api.queries.clientRequests.listClientFeedback,
    user?._id
      ? {
          userId: user._id,
          status: (statusFilter as "new" | "reviewed") || undefined,
        }
      : "skip"
  );

  const markReviewed = useMutation(
    api.mutations.clientRequests.markFeedbackReviewed
  );
  const toggleFeatured = useMutation(
    api.mutations.clientRequests.toggleFeedbackFeaturedOnSite
  );

  const [updating, setUpdating] = useState<Id<"clientFeedback"> | null>(null);
  const [togglingFeatured, setTogglingFeatured] = useState<Id<"clientFeedback"> | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  if (!user || feedback === undefined) return <PageLoader />;

  const handleToggleFeatured = async (feedbackId: Id<"clientFeedback">, currentlyFeatured: boolean) => {
    setTogglingFeatured(feedbackId);
    try {
      await toggleFeatured({ userId: user._id, feedbackId, featured: !currentlyFeatured });
      setToast({ message: currentlyFeatured ? t("feedback.removedFromSite") : t("feedback.featuredOnSite"), type: "success" });
      setTimeout(() => setToast(null), 3000);
    } catch (err: any) {
      setToast({ message: err.message || t("feedback.failedToUpdate"), type: "error" });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setTogglingFeatured(null);
    }
  };

  const handleMarkReviewed = async (feedbackId: Id<"clientFeedback">) => {
    setUpdating(feedbackId);
    try {
      await markReviewed({ userId: user._id, feedbackId });
      setToast({ message: t("feedback.markedAsReviewed"), type: "success" });
      setTimeout(() => setToast(null), 3000);
    } catch (err: any) {
      setToast({
        message: err.message || t("feedback.failedToUpdate"),
        type: "error",
      });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div>
      <PageHeader
        title={t("feedback.title")}
        description={t("feedback.description")}
      />

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {statusOptions.map((opt) => (
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

      {feedback.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title={t("feedback.noFeedbackYet")}
          description={
            statusFilter
              ? t("feedback.noFeedbackFilter")
              : t("feedback.noFeedbackEmpty")
          }
        />
      ) : (
        <div className="space-y-3">
          {feedback.map((fb) => (
            <div
              key={fb._id}
              className="card space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StarRating rating={fb.rating} />
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        fb.status === "new"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {fb.status === "new" ? t("status.new") : t("status.reviewed")}
                    </span>
                  </div>

                  {fb.comment && (
                    <p className="text-sm text-gray-700 line-clamp-2">
                      {fb.comment}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5" />
                      {fb.requesterName}
                    </span>
                    {fb.requesterEmail && (
                      <span className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5" />
                        {fb.requesterEmail}
                      </span>
                    )}
                    {fb.requestSummary && (
                      <span className="flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5" />
                        {fb.requestSummary}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {timeAgo(fb.createdAt)}
                  </span>
                  <button
                    onClick={() => handleToggleFeatured(fb._id, !!(fb as any).featuredOnSite)}
                    disabled={togglingFeatured === fb._id}
                    className={`text-xs flex items-center gap-1 px-2 py-1 rounded border transition-colors ${
                      (fb as any).featuredOnSite
                        ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                        : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    {togglingFeatured === fb._id
                      ? "..."
                      : (fb as any).featuredOnSite
                        ? t("feedback.onMiniSite")
                        : t("feedback.showOnSite")}
                  </button>
                  {fb.status === "new" && (
                    <button
                      onClick={() => handleMarkReviewed(fb._id)}
                      disabled={updating === fb._id}
                      className="btn-secondary text-xs flex items-center gap-1"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      {updating === fb._id ? "..." : t("feedback.markReviewed")}
                    </button>
                  )}
                </div>
              </div>

              {/* Contact info from feedback form (if different from requester) */}
              {(fb.contactName || fb.contactEmail) && (
                <div className="border-t pt-2 text-xs text-gray-500">
                  <span className="font-medium text-gray-600">
                    {t("feedback.feedbackContact")}
                  </span>{" "}
                  {[fb.contactName, fb.contactEmail]
                    .filter(Boolean)
                    .join(" — ")}
                </div>
              )}
            </div>
          ))}
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
