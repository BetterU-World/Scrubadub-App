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

type ViewMode = "month" | "week" | "day";

export function CalendarPage() {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [cleanerFilter, setCleanerFilter] = useState<string>("all");

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

  const formatJobType = (type: string) => type.replace(/_/g, " ");

  return (
    <div>
      <PageHeader title="Calendar" />

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
            {mode}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <label htmlFor="property-filter" className="text-sm font-medium text-gray-700">
            Property
          </label>
          <select
            id="property-filter"
            value={propertyFilter}
            onChange={(e) => setPropertyFilter(e.target.value)}
            className="input-field py-1.5 text-sm min-w-[180px]"
          >
            <option value="all">All Properties</option>
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
              Cleaner
            </label>
            <select
              id="cleaner-filter"
              value={cleanerFilter}
              onChange={(e) => setCleanerFilter(e.target.value)}
              className="input-field py-1.5 text-sm min-w-[180px]"
            >
              <option value="all">All Cleaners</option>
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
              Today
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
          />
        )}

        {/* Week View */}
        {viewMode === "week" && (
          <WeekView
            days={days}
            today={today}
            jobsByDate={jobsByDate}
          />
        )}

        {/* Day View */}
        {viewMode === "day" && (
          <DayView
            date={currentDate}
            today={today}
            jobs={jobsByDate[format(currentDate, "yyyy-MM-dd")] || []}
            formatJobType={formatJobType}
          />
        )}
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
}

function MonthView({ days, currentDate, today, jobsByDate }: MonthViewProps) {
  return (
    <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
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
            <div
              className={`text-sm font-medium mb-1 ${
                isToday ? "text-primary-600 font-bold" : "text-gray-700"
              }`}
            >
              {format(day, "d")}
            </div>
            <div className="space-y-1">
              {dayJobs.slice(0, 3).map((job) => (
                <Link key={job._id} href={`/jobs/${job._id}`}>
                  <a className="block text-xs p-1 rounded bg-primary-50 text-primary-700 truncate hover:bg-primary-100">
                    {job.propertyName}
                  </a>
                </Link>
              ))}
              {dayJobs.length > 3 && (
                <span className="text-xs text-gray-400">
                  +{dayJobs.length - 3} more
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
}

function WeekView({ days, today, jobsByDate }: WeekViewProps) {
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
            <div
              className={`text-sm font-semibold ${
                isToday ? "text-primary-600" : "text-gray-900"
              }`}
            >
              {format(day, "d")}
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
              {dayJobs.map((job) => (
                <Link key={job._id} href={`/jobs/${job._id}`}>
                  <a className="block p-2 rounded-lg border border-gray-200 hover:border-primary-300 hover:shadow-sm transition-all bg-white">
                    {job.startTime && (
                      <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                        <Clock className="w-3 h-3" />
                        {job.startTime}
                      </div>
                    )}
                    <div className="text-xs font-medium text-gray-900 truncate">
                      {job.propertyName}
                    </div>
                    {job.cleaners && job.cleaners.length > 0 && (
                      <div className="text-xs text-gray-500 truncate mt-0.5">
                        {job.cleaners.map((c: any) => c.name).join(", ")}
                      </div>
                    )}
                    <div className="mt-1">
                      <StatusBadge status={job.status} className="text-[10px] px-1.5 py-0" />
                    </div>
                  </a>
                </Link>
              ))}
              {dayJobs.length === 0 && (
                <div className="text-xs text-gray-300 text-center pt-4">
                  No jobs
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
}

function DayView({ date, today, jobs, formatJobType }: DayViewProps) {
  const isToday = isSameDay(date, today);

  return (
    <div>
      {isToday && (
        <div className="text-sm text-primary-600 font-medium mb-4">Today</div>
      )}
      {jobs.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">No jobs scheduled</p>
          <p className="text-sm mt-1">
            {format(date, "EEEE, MMMM d, yyyy")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <Link key={job._id} href={`/jobs/${job._id}`}>
              <a className="block p-4 rounded-lg border border-gray-200 hover:border-primary-300 hover:shadow-md transition-all bg-white">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Time */}
                    {job.startTime && (
                      <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-1">
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
                      <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="text-base font-semibold text-gray-900">
                        {job.propertyName}
                      </span>
                    </div>
                    {/* Cleaners */}
                    {job.cleaners && job.cleaners.length > 0 && (
                      <div className="flex items-center gap-1.5 text-sm text-gray-600 mb-2">
                        <Users className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span>
                          {job.cleaners.map((c: any) => c.name).join(", ")}
                        </span>
                      </div>
                    )}
                    {/* Job type */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={job.status} />
                      <span className="badge bg-gray-100 text-gray-700 capitalize">
                        {formatJobType(job.type)}
                      </span>
                    </div>
                  </div>
                </div>
              </a>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
