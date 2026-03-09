import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight, Clock, MapPin, Users } from "lucide-react";
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

type ViewMode = "month" | "week" | "day";

export function CalendarPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [cleanerFilter, setCleanerFilter] = useState<string>("all");

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
          startDate: format(rangeStart, "yyyy-MM-dd"),
          endDate: format(rangeEnd, "yyyy-MM-dd"),
        }
      : "skip"
  );

  // Query properties for filter dropdown
  const properties = useQuery(
    api.queries.properties.list,
    user?.companyId ? { companyId: user.companyId, userId: user._id } : "skip"
  );

  // Query cleaners for filter dropdown
  const cleaners = useQuery(
    api.queries.employees.getCleaners,
    user?.companyId ? { companyId: user.companyId, userId: user._id } : "skip"
  );

  // Apply client-side filters (role-based + user selections)
  const filteredJobs = useMemo(() => {
    if (!jobs) return [];
    let result = [...jobs];

    // Cleaners only see their own jobs
    if (user?.role === "cleaner") {
      result = result.filter((job) =>
        job.cleanerIds.includes(user._id)
      );
    }

    // Property filter
    if (propertyFilter !== "all") {
      result = result.filter((job) => job.propertyId === propertyFilter);
    }

    // Cleaner filter
    if (cleanerFilter !== "all") {
      result = result.filter((job) =>
        job.cleanerIds.includes(cleanerFilter as any)
      );
    }

    return result;
  }, [jobs, user, propertyFilter, cleanerFilter]);

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

  const today = new Date();

  const formatJobType = (type: string) => t(`jobTypes.${type}`, type.replace(/_/g, " "));

  // Color helper based on job status first, then acceptanceStatus
  const getJobColor = (job: any) => {
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
      <PageHeader title={t("calendar.title")} />

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
            {properties?.map((p) => (
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
                <Link key={job._id} href={`/jobs/${job._id}`} className={`block text-xs p-1 rounded truncate ${getJobColor(job)} ${isJobStrikethrough(job) ? "line-through" : ""}`}>
                    {job.propertyName}
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
                <Link key={job._id} href={`/jobs/${job._id}`} className={`block p-2 rounded-lg border ${borderColor} hover:shadow-sm transition-all ${bgColor}`}>
                    {job.startTime && (
                      <div className={`flex items-center gap-1 text-xs mb-1 ${isCancelled || isCompleted ? "text-gray-400" : "text-gray-500"}`}>
                        <Clock className="w-3 h-3" />
                        {job.startTime}
                      </div>
                    )}
                    <div className={`text-xs font-medium truncate ${isCancelled ? "text-gray-400 line-through" : isCompleted ? "text-gray-500" : "text-gray-900"}`}>
                      {job.propertyName}
                    </div>
                    {job.cleaners && job.cleaners.length > 0 && (
                      <div className={`text-xs truncate mt-0.5 ${isCancelled || isCompleted ? "text-gray-400" : "text-gray-500"}`}>
                        {job.cleaners.map((c: any) => c.name).join(", ")}
                      </div>
                    )}
                    <div className="mt-1 flex gap-1">
                      <StatusBadge status={job.status} className="text-[10px] px-1.5 py-0" />
                      {!isCancelled && <StatusBadge status={acceptance} className="text-[10px] px-1.5 py-0" />}
                    </div>
                </Link>
                );
              })}
              {dayJobs.length === 0 && (
                <div className="text-xs text-gray-300 text-center pt-4">
                  {t("calendar.noJobs")}
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
          <p className="text-lg">{t("calendar.noJobsScheduled")}</p>
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
            <Link key={job._id} href={`/jobs/${job._id}`} className={`block p-4 rounded-lg border transition-all ${cardBg}`}>
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
                        {job.propertyName}
                      </span>
                    </div>
                    {/* Cleaners */}
                    {job.cleaners && job.cleaners.length > 0 && (
                      <div className={`flex items-center gap-1.5 text-sm mb-2 ${isCancelled || isCompleted ? "text-gray-400" : "text-gray-600"}`}>
                        <Users className={`w-4 h-4 flex-shrink-0 ${isCancelled || isCompleted ? "text-gray-300" : "text-gray-400"}`} />
                        <span>
                          {job.cleaners.map((c: any) => c.name).join(", ")}
                        </span>
                      </div>
                    )}
                    {/* Job type */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={job.status} />
                      {!isCancelled && <StatusBadge status={job.acceptanceStatus ?? "pending"} />}
                      <span className="badge bg-gray-100 text-gray-700 capitalize">
                        {formatJobType(job.type)}
                      </span>
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
