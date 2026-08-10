import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getJobPrimaryStatus } from "@/lib/partnerJobStatus";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight, ClipboardCheck, Clock, MapPin, Users } from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
} from "date-fns";
import { useTranslation } from "react-i18next";
import { filterByManagerJobScope, getEffectiveManagerJobScope, type ManagerJobScope } from "@/lib/managerJobScope";

type ViewMode = "month" | "week" | "day";

export function CalendarPage() {
  const { user, sessionToken } = useAuth();
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [cleanerFilter, setCleanerFilter] = useState<string>("all");
  const [requestedScope, setRequestedScope] = useState<ManagerJobScope>("all");
  const canManageCalendar = user?.role === "owner" || user?.role === "manager";

  const viewModeLabels: Record<ViewMode, string> = {
    month: t("calendar.month"),
    week: t("calendar.week"),
    day: t("calendar.day"),
  };

  // Compute date range based on view mode
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (viewMode === "month") {
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      return {
        rangeStart: startOfWeek(monthStart),
        rangeEnd: endOfWeek(monthEnd),
      };
    }
    if (viewMode === "week") {
      return {
        rangeStart: startOfWeek(currentDate),
        rangeEnd: endOfWeek(currentDate),
      };
    }
    // day
    return {
      rangeStart: currentDate,
      rangeEnd: currentDate,
    };
  }, [viewMode, currentDate]);

  // Query jobs for the computed range
  const jobs = useQuery(
    api.queries.jobs.getCalendarJobs,
    user?.companyId
      ? {
          companyId: user.companyId,
          userId: user._id,
          sessionToken,
          startDate: format(rangeStart, "yyyy-MM-dd"),
          endDate: format(rangeEnd, "yyyy-MM-dd"),
        }
      : "skip"
  );
  const walkthroughs = useQuery(
    (api as any).queries.walkthroughs.listCalendarWalkthroughs,
    user?.role === "owner" && user.companyId
      ? {
          companyId: user.companyId,
          userId: user._id,
          sessionToken,
          startDate: format(rangeStart, "yyyy-MM-dd"),
          endDate: format(rangeEnd, "yyyy-MM-dd"),
        }
      : "skip"
  );

  const calendarItems = useMemo(() => [
    ...(jobs ?? []).map((job) => ({ ...job, eventType: "job", href: `/jobs/${job._id}` })),
    ...(walkthroughs ?? []).map((walkthrough: any) => ({
      ...walkthrough,
      eventType: "walkthrough",
      href: walkthrough.clientRequestId ? `/requests/${walkthrough.clientRequestId}` : "/requests",
      startTime: walkthrough.scheduledStartTime,
      endTime: walkthrough.scheduledEndTime,
      status: walkthrough.appointmentStatus ?? "scheduled",
      cleanerIds: [],
      cleaners: [],
      propertyName: walkthrough.propertyName || walkthrough.title,
    })),
  ], [jobs, walkthroughs]);

  // Query properties for filter dropdown
  const properties = useQuery(
    api.queries.properties.list,
    user?.companyId && canManageCalendar
      ? { companyId: user.companyId, userId: user._id, sessionToken }
      : "skip"
  );

  // Query cleaners for filter dropdown
  const cleaners = useQuery(
    api.queries.employees.getCleaners,
    user?.companyId && user.role === "owner" && sessionToken
      ? { companyId: user.companyId, userId: user._id, sessionToken }
      : "skip"
  );

  const propertyOptions = useMemo(() => {
    if (properties) return properties;
    const options = new Map<string, { _id: string; name: string }>();
    for (const item of calendarItems) {
      if (item.propertyId) {
        options.set(String(item.propertyId), {
          _id: String(item.propertyId),
          name: item.propertyName,
        });
      }
    }
    return [...options.values()];
  }, [properties, calendarItems]);

  // Apply client-side filters (role-based + user selections)
  const filteredJobs = useMemo(() => {
    let result = [...calendarItems];

    // Cleaners only see their own jobs
    if (user?.role === "cleaner" || user?.role === "maintenance") {
      result = result.filter((job) => (job as any).isAssignedToCurrentUser !== false);
    } else if (user?.role === "manager") {
      result = filterByManagerJobScope(result, requestedScope, user.canSeeAllJobs === true);
    }

    // Property filter
    if (propertyFilter !== "all") {
      result = result.filter((job) => job.propertyId === propertyFilter);
    }

    // Cleaner filter
    if (cleanerFilter !== "all") {
      result = result.filter((item) =>
        item.eventType === "job" && item.cleanerIds.includes(cleanerFilter as any)
      );
    }

    return result;
  }, [calendarItems, user, requestedScope, propertyFilter, cleanerFilter]);

  // Group jobs by date string
  const jobsByDate = useMemo(() => {
    const map: Record<string, typeof filteredJobs> = {};
    for (const job of filteredJobs) {
      (map[job.scheduledDate] = map[job.scheduledDate] || []).push(job);
    }
    // Sort each day's jobs by startTime
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
    }
    return map;
  }, [filteredJobs]);

  // Days array for month and week views
  const days = useMemo(
    () => eachDayOfInterval({ start: rangeStart, end: rangeEnd }),
    [rangeStart.getTime(), rangeEnd.getTime()]
  );

  // Navigation handlers
  const navigatePrev = () => {
    if (viewMode === "month") setCurrentDate(subMonths(currentDate, 1));
    else if (viewMode === "week") setCurrentDate(subWeeks(currentDate, 1));
    else setCurrentDate(subDays(currentDate, 1));
  };

  const navigateNext = () => {
    if (viewMode === "month") setCurrentDate(addMonths(currentDate, 1));
    else if (viewMode === "week") setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, 1));
  };

  const navigateToday = () => setCurrentDate(new Date());

  // Header label based on view
  const headerLabel = useMemo(() => {
    if (viewMode === "month") return format(currentDate, "MMMM yyyy");
    if (viewMode === "week") {
      const weekStart = startOfWeek(currentDate);
      const weekEnd = endOfWeek(currentDate);
      const sameMonth = format(weekStart, "MMM") === format(weekEnd, "MMM");
      if (sameMonth) {
        return `${format(weekStart, "MMM d")} - ${format(weekEnd, "d, yyyy")}`;
      }
      return `${format(weekStart, "MMM d")} - ${format(weekEnd, "MMM d, yyyy")}`;
    }
    return format(currentDate, "EEEE, MMMM d, yyyy");
  }, [viewMode, currentDate]);

  if (!user) return <PageLoader />;

  const scope = getEffectiveManagerJobScope(requestedScope, user.canSeeAllJobs === true);

  const today = new Date();

  const formatJobType = (type: string) => t(`jobTypes.${type}`, type.replace(/_/g, " "));

  // Color helper based on job status first, then acceptanceStatus
  const getJobColor = (job: any) => {
    if (job.eventType === "walkthrough") return "bg-purple-100 text-purple-800 hover:bg-purple-200";
    if (job.partnerResponseStatus === "rejected") return "bg-red-50 text-red-700 hover:bg-red-100";
    if (job.partnerResponseStatus === "accepted") return "bg-green-100 text-green-800 hover:bg-green-200";
    if (job.partnerResponseStatus === "pending") return "bg-yellow-50 text-yellow-800 hover:bg-yellow-100";
    if (job.status === "cancelled") return "bg-gray-100 text-gray-400 hover:bg-gray-200";
    if (job.status === "approved" || job.status === "submitted") return "bg-gray-200 text-gray-500 hover:bg-gray-300";
    const acceptance = job.acceptanceStatus ?? "pending";
    if (acceptance === "accepted") return "bg-green-100 text-green-800 hover:bg-green-200";
    if (acceptance === "denied") return "bg-red-50 text-red-400 hover:bg-red-100";
    return "bg-gray-100 text-gray-600 hover:bg-gray-200"; // pending
  };

  // Whether the job title should have strikethrough
  const isJobStrikethrough = (job: any) => job.status === "cancelled";

  const dayHeaders = [
    t("calendar.sun"), t("calendar.mon"), t("calendar.tue"),
    t("calendar.wed"), t("calendar.thu"), t("calendar.fri"), t("calendar.sat"),
  ];

  return (
    <div>
      <PageHeader title={t("calendar.title")} description={t("guidance.owner.calendar")} />

      {user.role === "manager" && user.canSeeAllJobs && (
        <div className="mb-4 flex w-fit items-center gap-1 rounded-lg bg-gray-100 p-1" aria-label="Calendar scope">
          {(["all", "my"] as ManagerJobScope[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRequestedScope(option)}
              className={`rounded-md px-4 py-2 text-sm font-medium ${scope === option ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
            >
              {option === "all" ? "All Jobs" : "My Jobs"}
            </button>
          ))}
        </div>
      )}

      {/* View Mode Tabs */}
      <div className="flex items-center gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {(["month", "week", "day"] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-4 py-2 text-sm font-medium rounded-md capitalize transition-colors ${
              viewMode === mode
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {viewModeLabels[mode]}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <label htmlFor="property-filter" className="text-sm font-medium text-gray-700">
            {t("calendar.property")}
          </label>
          <select
            id="property-filter"
            value={propertyFilter}
            onChange={(e) => setPropertyFilter(e.target.value)}
            className="input-field py-1.5 text-sm min-w-[180px]"
          >
            <option value="all">{t("calendar.allProperties")}</option>
            {propertyOptions.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {user.role === "owner" && (
          <div className="flex items-center gap-2">
            <label htmlFor="cleaner-filter" className="text-sm font-medium text-gray-700">
              {t("calendar.cleaner")}
            </label>
            <select
              id="cleaner-filter"
              value={cleanerFilter}
              onChange={(e) => setCleanerFilter(e.target.value)}
              className="input-field py-1.5 text-sm min-w-[180px]"
            >
              <option value="all">{t("calendar.allCleaners")}</option>
              {cleaners?.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Calendar Card */}
      <div className="card">
        {/* Navigation Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={navigatePrev}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">{headerLabel}</h2>
            <button
              onClick={navigateToday}
              className="btn-secondary text-xs px-2 py-1"
            >
              {t("calendar.today")}
            </button>
          </div>
          <button
            onClick={navigateNext}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Month View */}
        {viewMode === "month" && (
          <MonthView
            days={days}
            currentDate={currentDate}
            today={today}
            jobsByDate={jobsByDate}
            getJobColor={getJobColor}
            isJobStrikethrough={isJobStrikethrough}
            dayHeaders={dayHeaders}
            t={t}
          />
        )}

        {/* Week View */}
        {viewMode === "week" && (
          <WeekView
            days={days}
            today={today}
            jobsByDate={jobsByDate}
            getJobColor={getJobColor}
            isJobStrikethrough={isJobStrikethrough}
            t={t}
          />
        )}

        {/* Day View */}
        {viewMode === "day" && (
          <DayView
            date={currentDate}
            today={today}
            jobs={jobsByDate[format(currentDate, "yyyy-MM-dd")] || []}
            formatJobType={formatJobType}
            isJobStrikethrough={isJobStrikethrough}
            t={t}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-purple-100 border border-purple-200" />
          {t("calendar.walkthrough")}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-green-100 border border-green-200" />
          {t("status.accepted")}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-gray-100 border border-gray-200" />
          {t("status.pending")}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-gray-200 border border-gray-300" />
          {t("status.completed")}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-gray-100 border border-gray-200" />
          <span className="line-through">{t("status.cancelled")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-primary-500" />
          {t("calendar.today")}
        </div>
      </div>
    </div>
  );
}

// ---------- Month View ----------

interface MonthViewProps {
  days: Date[];
  currentDate: Date;
  today: Date;
  jobsByDate: Record<string, any[]>;
  getJobColor: (job: any) => string;
  isJobStrikethrough: (job: any) => boolean;
  dayHeaders: string[];
  t: (key: string, opts?: any) => string;
}

function MonthView({ days, currentDate, today, jobsByDate, getJobColor, isJobStrikethrough, dayHeaders, t }: MonthViewProps) {
  return (
    <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
      {dayHeaders.map((d) => (
        <div
          key={d}
          className="bg-gray-50 p-2 text-center text-xs font-medium text-gray-500"
        >
          {d}
        </div>
      ))}
      {days.map((day) => {
        const dateStr = format(day, "yyyy-MM-dd");
        const dayJobs = jobsByDate[dateStr] || [];
        const isToday = isSameDay(day, today);
        const isCurrentMonth = isSameMonth(day, currentDate);

        return (
          <div
            key={dateStr}
            className={`bg-white p-2 min-h-[80px] ${
              !isCurrentMonth ? "opacity-40" : ""
            }`}
          >
            <div className="flex flex-col items-start mb-1">
              <span
                className={`text-sm font-medium ${
                  isToday ? "text-primary-600 font-bold" : "text-gray-700"
                }`}
              >
                {format(day, "d")}
              </span>
              {isToday && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary-500 mt-0.5 ml-1" />
              )}
            </div>
            <div className="space-y-1">
              {dayJobs.slice(0, 3).map((job) => (
                <Link key={`${job.eventType}-${job._id}`} href={job.href} className={`block text-xs p-1 rounded truncate ${getJobColor(job)} ${isJobStrikethrough(job) ? "line-through" : ""}`}>
                    {job.eventType === "walkthrough" && <ClipboardCheck className="mr-1 inline h-3 w-3" aria-hidden="true" />}{job.propertyName}{(job as any).assignedTeamName ? ` · ${(job as any).assignedTeamName}` : ""}
                </Link>
              ))}
              {dayJobs.length > 3 && (
                <span className="text-xs text-gray-400">
                  {t("calendar.more", { count: dayJobs.length - 3 })}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Week View ----------

interface WeekViewProps {
  days: Date[];
  today: Date;
  jobsByDate: Record<string, any[]>;
  getJobColor: (job: any) => string;
  isJobStrikethrough: (job: any) => boolean;
  t: (key: string) => string;
}

function WeekView({ days, today, jobsByDate, getJobColor, isJobStrikethrough, t }: WeekViewProps) {
  return (
    <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
      {/* Day headers */}
      {days.map((day) => {
        const isToday = isSameDay(day, today);
        return (
          <div
            key={day.toISOString()}
            className={`bg-gray-50 p-2 text-center ${
              isToday ? "bg-primary-50" : ""
            }`}
          >
            <div className="text-xs font-medium text-gray-500">
              {format(day, "EEE")}
            </div>
            <div className="flex flex-col items-center">
              <span
                className={`text-sm font-semibold ${
                  isToday ? "text-primary-600" : "text-gray-900"
                }`}
              >
                {format(day, "d")}
              </span>
              {isToday && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary-500 mt-0.5" />
              )}
            </div>
          </div>
        );
      })}
      {/* Day columns with job cards */}
      {days.map((day) => {
        const dateStr = format(day, "yyyy-MM-dd");
        const dayJobs = jobsByDate[dateStr] || [];
        const isToday = isSameDay(day, today);

        return (
          <div
            key={dateStr}
            className={`bg-white p-2 min-h-[200px] ${
              isToday ? "bg-primary-50/30" : ""
            }`}
          >
            <div className="space-y-2">
              {dayJobs.map((job) => {
                const isCancelled = job.status === "cancelled";
                const isCompleted = job.status === "approved" || job.status === "submitted";
                const acceptance = job.acceptanceStatus ?? "pending";
                const borderColor = isCancelled ? "border-gray-200" : isCompleted ? "border-gray-300" : acceptance === "accepted" ? "border-green-300" : acceptance === "denied" ? "border-red-300" : "border-gray-200";
                const bgColor = isCancelled ? "bg-gray-50" : isCompleted ? "bg-gray-50" : "bg-white";
                return (
                <Link key={`${job.eventType}-${job._id}`} href={job.href} className={`block p-2 rounded-lg border ${job.eventType === "walkthrough" ? "border-purple-200" : borderColor} hover:shadow-sm transition-all ${job.eventType === "walkthrough" ? "bg-purple-50" : bgColor}`}>
                    {job.startTime && (
                      <div className={`flex items-center gap-1 text-xs mb-1 ${isCancelled || isCompleted ? "text-gray-400" : "text-gray-500"}`}>
                        <Clock className="w-3 h-3" />
                        {job.startTime}
                      </div>
                    )}
                    <div className={`text-xs font-medium truncate ${isCancelled ? "text-gray-400 line-through" : isCompleted ? "text-gray-500" : "text-gray-900"}`}>
                      {job.eventType === "walkthrough" && <ClipboardCheck className="mr-1 inline h-3 w-3 text-purple-600" aria-hidden="true" />}{job.propertyName}
                    </div>
                    {((job as any).assignedTeamName || (job.cleaners && job.cleaners.length > 0)) && (
                      <div className={`text-xs truncate mt-0.5 ${isCancelled || isCompleted ? "text-gray-400" : "text-gray-500"}`}>
                        {(job as any).assignedTeamName ? `Team: ${(job as any).assignedTeamName}` : job.cleaners.map((c: any) => c.name).join(", ")}
                      </div>
                    )}
                    <div className="mt-1 flex gap-1">
                      {job.eventType === "walkthrough" ? (
                        <span className="badge bg-purple-100 px-1.5 py-0 text-[10px] text-purple-800">{t("calendar.walkthrough")}</span>
                      ) : (
                        <StatusBadge status={getJobPrimaryStatus(job)} className="text-[10px] px-1.5 py-0" />
                      )}
                    </div>
                </Link>
                );
              })}
              {dayJobs.length === 0 && (
                <div className="text-xs text-gray-300 text-center pt-4">
                  {t("calendar.noEvents")}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Day View ----------

interface DayViewProps {
  date: Date;
  today: Date;
  jobs: any[];
  formatJobType: (type: string) => string;
  isJobStrikethrough: (job: any) => boolean;
  t: (key: string) => string;
}

function DayView({ date, today, jobs, formatJobType, isJobStrikethrough, t }: DayViewProps) {
  const isToday = isSameDay(date, today);

  return (
    <div>
      {isToday && (
        <div className="flex items-center gap-1.5 text-sm text-primary-600 font-medium mb-4">
          <span className="w-2 h-2 rounded-full bg-primary-500" />
          {t("calendar.today")}
        </div>
      )}
      {jobs.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">{t("calendar.noEventsScheduled")}</p>
          <p className="text-sm mt-1">
            {format(date, "EEEE, MMMM d, yyyy")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const isCancelled = job.status === "cancelled";
            const isCompleted = job.status === "approved" || job.status === "submitted";
            const cardBg = isCancelled ? "bg-gray-50 border-gray-200" : isCompleted ? "bg-gray-50 border-gray-200" : "bg-white border-gray-200 hover:border-primary-300 hover:shadow-md";
            return (
            <Link key={`${job.eventType}-${job._id}`} href={job.href} className={`block p-4 rounded-lg border transition-all ${job.eventType === "walkthrough" ? "bg-purple-50 border-purple-200 hover:border-purple-300 hover:shadow-md" : cardBg}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Time */}
                    {job.startTime && (
                      <div className={`flex items-center gap-1.5 text-sm mb-1 ${isCancelled || isCompleted ? "text-gray-400" : "text-gray-500"}`}>
                        <Clock className="w-4 h-4" />
                        <span>{job.startTime}</span>
                        {job.durationMinutes && (
                          <span className="text-gray-400">
                            ({job.durationMinutes} min)
                          </span>
                        )}
                      </div>
                    )}
                    {/* Property */}
                    <div className="flex items-center gap-1.5 mb-1">
                      <MapPin className={`w-4 h-4 flex-shrink-0 ${isCancelled || isCompleted ? "text-gray-300" : "text-gray-400"}`} />
                      <span className={`text-base font-semibold ${isCancelled ? "text-gray-400 line-through" : isCompleted ? "text-gray-500" : "text-gray-900"}`}>
                        {job.eventType === "walkthrough" && <ClipboardCheck className="mr-1 inline h-4 w-4 text-purple-600" aria-hidden="true" />}{job.propertyName}
                      </span>
                    </div>
                    {/* Cleaners */}
                    {((job as any).assignedTeamName || (job.cleaners && job.cleaners.length > 0)) && (
                      <div className={`flex items-center gap-1.5 text-sm mb-2 ${isCancelled || isCompleted ? "text-gray-400" : "text-gray-600"}`}>
                        <Users className={`w-4 h-4 flex-shrink-0 ${isCancelled || isCompleted ? "text-gray-300" : "text-gray-400"}`} />
                        <span>
                          {(job as any).assignedTeamName ? `Team: ${(job as any).assignedTeamName}` : job.cleaners.map((c: any) => c.name).join(", ")}
                        </span>
                      </div>
                    )}
                    {/* Job type */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {job.eventType === "walkthrough" ? (
                        <span className="badge bg-purple-100 text-purple-800">{t("calendar.walkthrough")}</span>
                      ) : (
                        <><StatusBadge status={getJobPrimaryStatus(job)} /><span className="badge bg-gray-100 text-gray-700 capitalize">{formatJobType(job.type)}</span></>
                      )}
                    </div>
                  </div>
                </div>
            </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
