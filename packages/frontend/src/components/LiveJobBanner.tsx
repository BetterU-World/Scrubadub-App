import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";

const ACTIVE_STATUSES = [
  "scheduled",
  "confirmed",
  "in_progress",
  "submitted",
  "rework_requested",
] as const;

function getToday(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function statusLabel(status: string): { icon: string; text: string } {
  switch (status) {
    case "scheduled":
      return { icon: "\uD83D\uDCC5", text: "Scheduled for today" };
    case "confirmed":
      return { icon: "\u2705", text: "Confirmed" };
    case "in_progress":
      return { icon: "\uD83E\uDDF9", text: "Cleaning in progress" };
    case "submitted":
      return { icon: "\u23F3", text: "Awaiting approval" };
    case "rework_requested":
      return { icon: "\uD83D\uDD04", text: "Rework requested" };
    default:
      return { icon: "\uD83D\uDCCB", text: status.replace(/_/g, " ") };
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "in_progress":
      return "bg-purple-600";
    case "submitted":
      return "bg-teal-600";
    case "rework_requested":
      return "bg-red-600";
    case "confirmed":
      return "bg-indigo-600";
    default:
      return "bg-blue-600";
  }
}

export function LiveJobBanner() {
  const { user } = useAuth();

  const jobs = useQuery(
    api.queries.jobs.list,
    user ? { companyId: user.companyId, userId: user._id } : "skip"
  );

  if (!user || !jobs) return null;

  const today = getToday();

  const activeJobs = jobs.filter((job) => {
    if (job.scheduledDate !== today) return false;
    if (!ACTIVE_STATUSES.includes(job.status as (typeof ACTIVE_STATUSES)[number])) return false;
    if (user.role === "cleaner" && !job.cleanerIds.includes(user._id)) return false;
    return true;
  });

  if (activeJobs.length === 0) return null;

  const job = activeJobs[0];
  const { icon, text } = statusLabel(job.status);
  const cleanerName = job.cleaners?.[0]?.name ?? "Cleaner";
  const propertyName = job.propertyName ?? "Unknown Property";

  let bannerText: string;
  if (job.status === "in_progress") {
    bannerText = `${icon} ${cleanerName} is cleaning ${propertyName}`;
  } else if (job.status === "submitted") {
    bannerText = `${icon} Cleaning completed at ${propertyName} \u2014 awaiting approval`;
  } else if (job.status === "rework_requested") {
    bannerText = `${icon} Rework requested at ${propertyName}`;
  } else {
    bannerText = `${icon} ${propertyName} \u2014 ${text}`;
  }

  const timestamp = job.startedAt ?? job.acceptedAt;
  const timeStr = timestamp
    ? new Date(timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : job.startTime ?? null;

  return (
    <div className={`${statusColor(job.status)} text-white px-4 py-2 text-sm flex items-center justify-between`}>
      <span className="font-medium truncate">{bannerText}</span>
      <span className="flex items-center gap-3 shrink-0 ml-3">
        {timeStr && (
          <span className="text-white/80 text-xs">{timeStr}</span>
        )}
        {activeJobs.length > 1 && (
          <span className="bg-white/20 rounded-full px-2 py-0.5 text-xs">
            +{activeJobs.length - 1} more
          </span>
        )}
      </span>
    </div>
  );
}
