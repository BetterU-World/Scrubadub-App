import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader, LoadingSpinner } from "@/components/ui/LoadingSpinner";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

interface DayRow {
  dayOfWeek: number;
  enabled: boolean;
  startMinutes: number;
  endMinutes: number;
}

/** Returns "YYYY-MM-DD" for today + N days */
function dateOffsetString(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split("T")[0];
}

const MIN_OVERRIDE_DAYS = 14;

export function AvailabilityPage() {
  const { user } = useAuth();

  const weekly = useQuery(
    api.queries.availability.getMyWeeklyAvailability,
    user ? { userId: user._id } : "skip"
  );
  const overrides = useQuery(
    api.queries.availability.getMyOverrides,
    user ? { userId: user._id } : "skip"
  );

  const setWeekly = useMutation(
    api.mutations.availability.setWeeklyAvailability
  );
  const setOverride = useMutation(
    api.mutations.availability.setAvailabilityOverride
  );

  // Local state for weekly editor
  const [days, setDays] = useState<DayRow[]>(() =>
    Array.from({ length: 7 }, (_, i) => ({
      dayOfWeek: i,
      enabled: false,
      startMinutes: 480,
      endMinutes: 1020,
    }))
  );
  const [weeklyLoaded, setWeeklyLoaded] = useState(false);
  const [savingWeekly, setSavingWeekly] = useState(false);
  const [savingOverride, setSavingOverride] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Date picker state
  const [selectedDate, setSelectedDate] = useState("");

  // Sync weekly data once loaded
  useEffect(() => {
    if (weekly && !weeklyLoaded) {
      if (weekly.length > 0) {
        setDays((prev) =>
          prev.map((row) => {
            const match = weekly.find((w: any) => w.dayOfWeek === row.dayOfWeek);
            return match
              ? {
                  ...row,
                  enabled: match.enabled,
                  startMinutes: match.startMinutes,
                  endMinutes: match.endMinutes,
                }
              : row;
          })
        );
      }
      setWeeklyLoaded(true);
    }
  }, [weekly, weeklyLoaded]);

  if (!user || weekly === undefined || overrides === undefined)
    return <PageLoader />;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleSaveWeekly = async () => {
    setSavingWeekly(true);
    try {
      await setWeekly({ userId: user._id, availability: days });
      showToast("Availability saved");
    } catch (err: any) {
      showToast(err.message || "Failed to save");
    } finally {
      setSavingWeekly(false);
    }
  };

  const handleSetOverride = async (date: string, unavailable: boolean) => {
    setSavingOverride(date);
    try {
      await setOverride({
        userId: user._id,
        date,
        unavailable,
      });
      showToast(unavailable ? "Marked unavailable" : "Marked available");
    } catch (err: any) {
      showToast(err.message || "Failed to update");
    } finally {
      setSavingOverride(null);
    }
  };

  const updateDay = (dayOfWeek: number, patch: Partial<DayRow>) => {
    setDays((prev) =>
      prev.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, ...patch } : d))
    );
  };

  const overrideMap = new Map(
    overrides.map((o: any) => [o.date, o.unavailable])
  );

  // Min selectable date: today + 14 days
  const minDate = dateOffsetString(MIN_OVERRIDE_DAYS);
  const minDateFormatted = new Date(minDate + "T12:00:00").toLocaleDateString(
    undefined,
    { month: "short", day: "numeric", year: "numeric" }
  );

  // Selected date info
  const selectedDateInfo = selectedDate
    ? (() => {
        const d = new Date(selectedDate + "T12:00:00");
        const dayName = DAY_NAMES[d.getDay()];
        const isUnavailable = overrideMap.get(selectedDate) === true;
        const hasOverride = overrideMap.has(selectedDate);
        return { dayName, isUnavailable, hasOverride };
      })()
    : null;

  // Upcoming overrides sorted by date, limited to future dates
  const today = dateOffsetString(0);
  const upcomingOverrides = overrides
    .filter((o: any) => o.date >= today)
    .sort((a: any, b: any) => a.date.localeCompare(b.date))
    .slice(0, 20);

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader title="My Availability" />

      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium bg-green-600 text-white">
          {toast}
        </div>
      )}

      {/* Weekly schedule */}
      <div className="card space-y-4 mb-6">
        <h3 className="text-sm font-semibold text-gray-900">
          Weekly Schedule
        </h3>
        <p className="text-xs text-gray-500">
          Set your regular working hours for each day of the week.
        </p>

        <div className="space-y-3">
          {days.map((row) => (
            <div
              key={row.dayOfWeek}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50"
            >
              <label className="flex items-center gap-2 w-28 cursor-pointer">
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(e) =>
                    updateDay(row.dayOfWeek, { enabled: e.target.checked })
                  }
                  className="w-4 h-4 text-primary-600 rounded border-gray-300"
                />
                <span className="text-sm font-medium text-gray-700">
                  {DAY_NAMES[row.dayOfWeek]}
                </span>
              </label>
              {row.enabled ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="time"
                    value={minutesToTime(row.startMinutes)}
                    onChange={(e) =>
                      updateDay(row.dayOfWeek, {
                        startMinutes: timeToMinutes(e.target.value),
                      })
                    }
                    className="input-field text-sm w-28"
                  />
                  <span className="text-xs text-gray-400">to</span>
                  <input
                    type="time"
                    value={minutesToTime(row.endMinutes)}
                    onChange={(e) =>
                      updateDay(row.dayOfWeek, {
                        endMinutes: timeToMinutes(e.target.value),
                      })
                    }
                    className="input-field text-sm w-28"
                  />
                </div>
              ) : (
                <span className="text-xs text-gray-400 italic">
                  Not available
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={handleSaveWeekly}
            disabled={savingWeekly}
            className="btn-primary flex items-center gap-2"
          >
            {savingWeekly && <LoadingSpinner size="sm" />}
            {savingWeekly ? "Saving..." : "Save Schedule"}
          </button>
        </div>
      </div>

      {/* Day overrides — date picker */}
      <div className="card space-y-4 mb-6">
        <h3 className="text-sm font-semibold text-gray-900">
          Day Overrides
        </h3>
        <p className="text-xs text-gray-500">
          Override your availability for a specific date. Overrides require 2
          weeks notice — you can only set dates starting{" "}
          <span className="font-medium text-gray-700">{minDateFormatted}</span>.
        </p>

        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Select a date
            </label>
            <input
              type="date"
              value={selectedDate}
              min={minDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="input-field text-sm w-full"
            />
          </div>
        </div>

        {selectedDate && selectedDateInfo && (
          <div className="p-3 bg-gray-50 rounded-lg space-y-3">
            <div className="text-sm">
              <span className="font-medium text-gray-700">
                {selectedDateInfo.dayName}
              </span>
              <span className="text-gray-400 ml-2">{selectedDate}</span>
              <span className="ml-3 text-xs">
                {selectedDateInfo.hasOverride ? (
                  selectedDateInfo.isUnavailable ? (
                    <span className="text-red-600 font-medium">
                      Currently: Unavailable (override set)
                    </span>
                  ) : (
                    <span className="text-green-600 font-medium">
                      Currently: Available (override set)
                    </span>
                  )
                ) : (
                  <span className="text-gray-500">
                    No override — using weekly schedule
                  </span>
                )}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleSetOverride(selectedDate, true)}
                disabled={
                  savingOverride === selectedDate ||
                  (selectedDateInfo.hasOverride &&
                    selectedDateInfo.isUnavailable)
                }
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedDateInfo.hasOverride && selectedDateInfo.isUnavailable
                    ? "bg-red-200 text-red-800 cursor-default"
                    : "bg-red-100 text-red-700 hover:bg-red-200"
                }`}
              >
                {savingOverride === selectedDate
                  ? "..."
                  : "Set Unavailable"}
              </button>
              <button
                onClick={() => handleSetOverride(selectedDate, false)}
                disabled={
                  savingOverride === selectedDate ||
                  (selectedDateInfo.hasOverride &&
                    !selectedDateInfo.isUnavailable)
                }
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedDateInfo.hasOverride && !selectedDateInfo.isUnavailable
                    ? "bg-green-200 text-green-800 cursor-default"
                    : "bg-green-100 text-green-700 hover:bg-green-200"
                }`}
              >
                {savingOverride === selectedDate
                  ? "..."
                  : "Set Available"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Existing overrides list */}
      {upcomingOverrides.length > 0 && (
        <div className="card space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">
            Upcoming Overrides
          </h3>
          <div className="space-y-2">
            {upcomingOverrides.map((o: any) => {
              const d = new Date(o.date + "T12:00:00");
              const dayName = DAY_NAMES[d.getDay()];
              const isSaving = savingOverride === o.date;
              const isEditable = o.date >= minDate;

              return (
                <div
                  key={o.date}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50"
                >
                  <div className="text-sm">
                    <span className="font-medium text-gray-700">{dayName}</span>
                    <span className="text-gray-400 ml-2">{o.date}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        o.unavailable
                          ? "bg-red-100 text-red-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {o.unavailable ? "Unavailable" : "Available"}
                    </span>
                    {isEditable && (
                      <button
                        onClick={() =>
                          handleSetOverride(o.date, !o.unavailable)
                        }
                        disabled={isSaving}
                        className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                      >
                        {isSaving ? "..." : "Toggle"}
                      </button>
                    )}
                    {!isEditable && (
                      <span className="text-xs text-gray-400">Locked</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
