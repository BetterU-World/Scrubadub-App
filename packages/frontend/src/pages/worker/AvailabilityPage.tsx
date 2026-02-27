import { useState, useEffect } from "react";
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

function getNext14Days(): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    days.push(d.toISOString().split("T")[0]);
  }
  return days;
}

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
      startMinutes: 480, // 8:00 AM
      endMinutes: 1020, // 5:00 PM
    }))
  );
  const [weeklyLoaded, setWeeklyLoaded] = useState(false);
  const [savingWeekly, setSavingWeekly] = useState(false);
  const [savingOverride, setSavingOverride] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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

  const handleToggleOverride = async (date: string, currentlyUnavailable: boolean) => {
    setSavingOverride(date);
    try {
      await setOverride({
        userId: user._id,
        date,
        unavailable: !currentlyUnavailable,
      });
      showToast(!currentlyUnavailable ? "Marked unavailable" : "Marked available");
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

  const next14 = getNext14Days();
  const overrideMap = new Map(
    overrides.map((o: any) => [o.date, o.unavailable])
  );

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

      {/* Day overrides */}
      <div className="card space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">
          Day Overrides (next 14 days)
        </h3>
        <p className="text-xs text-gray-500">
          Mark specific days as unavailable even if you normally work that day.
        </p>

        <div className="space-y-2">
          {next14.map((date) => {
            const d = new Date(date + "T12:00:00");
            const dayName = DAY_NAMES[d.getDay()];
            const isUnavailable = overrideMap.get(date) === true;
            const isSaving = savingOverride === date;

            return (
              <div
                key={date}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50"
              >
                <div className="text-sm">
                  <span className="font-medium text-gray-700">{dayName}</span>
                  <span className="text-gray-400 ml-2">{date}</span>
                </div>
                <button
                  onClick={() => handleToggleOverride(date, isUnavailable)}
                  disabled={isSaving}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isUnavailable
                      ? "bg-red-100 text-red-700 hover:bg-red-200"
                      : "bg-green-100 text-green-700 hover:bg-green-200"
                  }`}
                >
                  {isSaving
                    ? "..."
                    : isUnavailable
                      ? "Unavailable"
                      : "Available"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
