export type JobSort = "created_desc" | "soonest" | "updated_desc" | "created_asc";
export type JobDateRange = "all" | "today" | "week";
type BrowsableJob = { _id: string; _creationTime: number; scheduledDate: string; startTime?: string; completedAt?: number; approvedAt?: number; currentPauseStartedAt?: number; startedAt?: number; arrivedAt?: number; acceptedAt?: number; deniedAt?: number; cancelledAt?: number };

function latestEvidence(j: BrowsableJob) {
  return Math.max(j._creationTime, j.completedAt ?? 0, j.approvedAt ?? 0, j.currentPauseStartedAt ?? 0, j.startedAt ?? 0, j.arrivedAt ?? 0, j.acceptedAt ?? 0, j.deniedAt ?? 0, j.cancelledAt ?? 0);
}
export function sortJobs<T extends BrowsableJob>(jobs: readonly T[], sort: JobSort): T[] {
  return [...jobs].sort((a, b) => {
    if (sort === "created_desc") return b._creationTime - a._creationTime || b._id.localeCompare(a._id);
    if (sort === "created_asc") return a._creationTime - b._creationTime || a._id.localeCompare(b._id);
    if (sort === "updated_desc") return latestEvidence(b) - latestEvidence(a) || b._creationTime - a._creationTime;
    return a.scheduledDate.localeCompare(b.scheduledDate) || (a.startTime ?? "").localeCompare(b.startTime ?? "") || a._creationTime - b._creationTime;
  });
}
export function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function matchesDateRange(scheduledDate: string, range: JobDateRange, now = new Date()) {
  if (range === "all") return true;
  if (range === "today") return scheduledDate === localDateKey(now);
  const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  return scheduledDate >= localDateKey(monday) && scheduledDate <= localDateKey(sunday);
}
