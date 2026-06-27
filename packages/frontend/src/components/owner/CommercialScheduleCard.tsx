import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { CalendarDays, CalendarPlus, Check, Pause, Play, Save, XCircle } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";

type ToastType = "success" | "error";
type ScheduleStatus = "active" | "paused" | "ended";
type Frequency = "daily" | "weekly" | "biweekly" | "monthly" | "custom";

const FREQUENCIES: Frequency[] = ["daily", "weekly", "biweekly", "monthly", "custom"];
const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

const EMPTY_FORM = {
  propertyId: "",
  title: "",
  frequency: "weekly" as Frequency,
  daysOfWeek: [] as number[],
  dayOfMonth: "",
  startDate: "",
  endDate: "",
  defaultStartTime: "",
  defaultDueTime: "",
  assignedCleanerId: "",
  assignedManagerId: "",
  assignedTeamId: "",
  notes: "",
};

const EMPTY_GENERATE_FORM = {
  startDate: "",
  endDate: "",
};

function formatDate(date: string | undefined, fallback: string) {
  if (!date) return fallback;
  return new Date(`${date}T00:00:00`).toLocaleDateString();
}

function dateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDaysString(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return dateString(next);
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <div className="mt-1 text-sm text-gray-900">{value}</div>
    </div>
  );
}

export function CommercialScheduleCard({
  commercialAccountId,
  accountName,
  defaultPropertyId,
  defaultStartDate,
  defaultCleanerId,
  defaultManagerId,
  defaultTeamId,
  onToast,
}: {
  commercialAccountId: Id<"commercialAccounts">;
  accountName: string;
  defaultPropertyId?: Id<"properties">;
  defaultStartDate?: string;
  defaultCleanerId?: Id<"users">;
  defaultManagerId?: Id<"users">;
  defaultTeamId?: Id<"teams">;
  onToast?: (message: string, type: ToastType) => void;
}) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatingScheduleId, setGeneratingScheduleId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [generateForm, setGenerateForm] = useState(EMPTY_GENERATE_FORM);

  const schedules = useQuery(
    (api as any).queries.commercialSchedules.getByCommercialAccount,
    user ? { userId: user._id, commercialAccountId } : "skip"
  );
  const managers = useQuery(
    api.queries.employees.getManagers,
    user?.companyId ? { companyId: user.companyId, userId: user._id } : "skip"
  );
  const cleaners = useQuery(
    api.queries.employees.getCleaners,
    user?.companyId ? { companyId: user.companyId, userId: user._id } : "skip"
  );
  const teams = useQuery(
    api.queries.teams.listActiveForAssignment,
    user?.companyId ? { companyId: user.companyId, userId: user._id } : "skip"
  );
  const properties = useQuery(
    api.queries.properties.list,
    user?.companyId
      ? { companyId: user.companyId, userId: user._id, activeOnly: false }
      : "skip"
  );

  const createSchedule = useMutation((api as any).mutations.commercialSchedules.create);
  const updateSchedule = useMutation((api as any).mutations.commercialSchedules.update);
  const pauseSchedule = useMutation((api as any).mutations.commercialSchedules.pause);
  const reactivateSchedule = useMutation(
    (api as any).mutations.commercialSchedules.reactivate
  );
  const endSchedule = useMutation((api as any).mutations.commercialSchedules.end);
  const generateJobs = useMutation(
    (api as any).mutations.commercialSchedules.generateCommercialJobsFromSchedule
  );

  useEffect(() => {
    if (showForm && !editingId) return;
    setForm((current) => ({
      ...current,
      title: current.title || `${accountName} ${t("commercialSchedules.defaultTitle")}`,
      propertyId: current.propertyId || defaultPropertyId || "",
      startDate: current.startDate || defaultStartDate || "",
      assignedCleanerId: current.assignedCleanerId || defaultCleanerId || "",
      assignedManagerId: current.assignedManagerId || defaultManagerId || "",
      assignedTeamId: current.assignedTeamId || defaultTeamId || "",
    }));
  }, [
    accountName,
    defaultCleanerId,
    defaultManagerId,
    defaultPropertyId,
    defaultStartDate,
    defaultTeamId,
    editingId,
    showForm,
    t,
  ]);

  if (!user || schedules === undefined) {
    return (
      <section className="card space-y-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900">
            {t("commercialSchedules.title")}
          </h2>
        </div>
        <p className="text-sm text-gray-500">{t("common.loading")}</p>
      </section>
    );
  }

  const showToast = (message: string, type: ToastType) => onToast?.(message, type);

  const resetForm = () => {
    setForm({
      ...EMPTY_FORM,
      title: `${accountName} ${t("commercialSchedules.defaultTitle")}`,
      propertyId: defaultPropertyId || "",
      startDate: defaultStartDate || "",
      assignedCleanerId: defaultCleanerId || "",
      assignedManagerId: defaultManagerId || "",
      assignedTeamId: defaultTeamId || "",
    });
    setEditingId(null);
  };

  const editSchedule = (schedule: any) => {
    setForm({
      propertyId: schedule.propertyId ?? "",
      title: schedule.title ?? "",
      frequency: schedule.frequency ?? "weekly",
      daysOfWeek: schedule.daysOfWeek ?? [],
      dayOfMonth: schedule.dayOfMonth != null ? String(schedule.dayOfMonth) : "",
      startDate: schedule.startDate ?? "",
      endDate: schedule.endDate ?? "",
      defaultStartTime: schedule.defaultStartTime ?? "",
      defaultDueTime: schedule.defaultDueTime ?? "",
      assignedCleanerId: schedule.assignedCleanerId ?? "",
      assignedManagerId: schedule.assignedManagerId ?? "",
      assignedTeamId: schedule.assignedTeamId ?? "",
      notes: schedule.notes ?? "",
    });
    setEditingId(schedule._id);
    setShowForm(true);
  };

  const buildPayload = () => ({
    title: form.title,
    propertyId: (form.propertyId || undefined) as any,
    frequency: form.frequency,
    daysOfWeek: form.daysOfWeek.length ? form.daysOfWeek : undefined,
    dayOfMonth: form.dayOfMonth ? Number(form.dayOfMonth) : undefined,
    startDate: form.startDate || undefined,
    endDate: form.endDate || undefined,
    defaultStartTime: form.defaultStartTime || undefined,
    defaultDueTime: form.defaultDueTime || undefined,
    assignedCleanerId: (form.assignedCleanerId || undefined) as any,
    assignedManagerId: (form.assignedManagerId || undefined) as any,
    assignedTeamId: (form.assignedTeamId || undefined) as any,
    notes: form.notes || undefined,
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingId) {
        await updateSchedule({
          userId: user._id,
          scheduleId: editingId as Id<"commercialSchedules">,
          ...buildPayload(),
        });
        showToast(t("commercialSchedules.updated"), "success");
      } else {
        await createSchedule({
          userId: user._id,
          commercialAccountId,
          ...buildPayload(),
        });
        showToast(t("commercialSchedules.created"), "success");
      }
      resetForm();
      setShowForm(false);
    } catch (err: any) {
      showToast(err.message || t("commercialSchedules.saveFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusAction = async (
    scheduleId: Id<"commercialSchedules">,
    action: "pause" | "reactivate" | "end"
  ) => {
    setActionLoading(`${action}:${scheduleId}`);
    try {
      if (action === "pause") await pauseSchedule({ userId: user._id, scheduleId });
      if (action === "reactivate") {
        await reactivateSchedule({ userId: user._id, scheduleId });
      }
      if (action === "end") await endSchedule({ userId: user._id, scheduleId });
      showToast(t(`commercialSchedules.${action}Success`), "success");
    } catch (err: any) {
      showToast(err.message || t("commercialSchedules.actionFailed"), "error");
    } finally {
      setActionLoading(null);
    }
  };

  const openGenerateForm = (schedule: any) => {
    const today = new Date();
    setGenerateForm({
      startDate:
        schedule.startDate && schedule.startDate > dateString(today)
          ? schedule.startDate
          : dateString(today),
      endDate: addDaysString(today, 30),
    });
    setGeneratingScheduleId(schedule._id);
  };

  const handleGenerateJobs = async (scheduleId: Id<"commercialSchedules">) => {
    setGenerating(true);
    try {
      const result = await generateJobs({
        userId: user._id,
        commercialScheduleId: scheduleId,
        startDate: generateForm.startDate,
        endDate: generateForm.endDate,
      });
      showToast(
        t("commercialSchedules.generateSuccess", {
          created: result.createdCount,
          skipped: result.skippedDuplicateCount,
        }),
        "success"
      );
      setGeneratingScheduleId(null);
      setGenerateForm(EMPTY_GENERATE_FORM);
    } catch (err: any) {
      showToast(err.message || t("commercialSchedules.generateFailed"), "error");
    } finally {
      setGenerating(false);
    }
  };

  const toggleDay = (day: number) => {
    setForm((current) => ({
      ...current,
      daysOfWeek: current.daysOfWeek.includes(day)
        ? current.daysOfWeek.filter((value) => value !== day)
        : [...current.daysOfWeek, day].sort((a, b) => a - b),
    }));
  };

  const dayLabel = (day: number) => t(`commercialSchedules.days.${day}`);
  const shouldShowDays = ["weekly", "biweekly", "custom"].includes(form.frequency);

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-gray-400" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {t("commercialSchedules.title")}
            </h2>
            <p className="text-sm text-gray-500">{t("commercialSchedules.helper")}</p>
          </div>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="btn-primary text-sm"
          >
            {t("commercialSchedules.create")}
          </button>
        )}
      </div>

      {schedules.length === 0 && !showForm && (
        <p className="text-sm text-gray-500">{t("commercialSchedules.emptyDesc")}</p>
      )}

      {showForm && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-gray-600">
                {t("commercialSchedules.scheduleTitle")}
              </span>
              <input
                className="input-field mt-1"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">
                {t("commercialSchedules.property")}
              </span>
              <select
                className="input-field mt-1"
                value={form.propertyId}
                onChange={(e) => setForm({ ...form, propertyId: e.target.value })}
              >
                <option value="">{t("common.unassigned")}</option>
                {(properties ?? []).map((property: any) => (
                  <option key={property._id} value={property._id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">
                {t("commercialSchedules.frequency")}
              </span>
              <select
                className="input-field mt-1"
                value={form.frequency}
                onChange={(e) => setForm({ ...form, frequency: e.target.value as Frequency })}
              >
                {FREQUENCIES.map((frequency) => (
                  <option key={frequency} value={frequency}>
                    {t(`commercialSchedules.frequencies.${frequency}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {shouldShowDays && (
            <div>
              <span className="text-xs font-medium text-gray-600">
                {t("commercialSchedules.daysOfWeek")}
              </span>
              <div className="mt-1 flex flex-wrap gap-2">
                {DAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                      form.daysOfWeek.includes(day)
                        ? "border-primary-200 bg-primary-50 text-primary-700"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {dayLabel(day)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {form.frequency === "monthly" && (
            <label className="block">
              <span className="text-xs font-medium text-gray-600">
                {t("commercialSchedules.dayOfMonth")}
              </span>
              <input
                type="number"
                min="1"
                max="31"
                className="input-field mt-1"
                value={form.dayOfMonth}
                onChange={(e) => setForm({ ...form, dayOfMonth: e.target.value })}
              />
            </label>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">
                {t("commercialSchedules.startDate")}
              </span>
              <input
                type="date"
                className="input-field mt-1"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">
                {t("commercialSchedules.endDate")}
              </span>
              <input
                type="date"
                className="input-field mt-1"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">
                {t("commercialSchedules.defaultStartTime")}
              </span>
              <input
                type="time"
                className="input-field mt-1"
                value={form.defaultStartTime}
                onChange={(e) => setForm({ ...form, defaultStartTime: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">
                {t("commercialSchedules.defaultDueTime")}
              </span>
              <input
                type="time"
                className="input-field mt-1"
                value={form.defaultDueTime}
                onChange={(e) => setForm({ ...form, defaultDueTime: e.target.value })}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">
                {t("commercialSchedules.assignedCleaner")}
              </span>
              <select
                className="input-field mt-1"
                value={form.assignedCleanerId}
                onChange={(e) => setForm({ ...form, assignedCleanerId: e.target.value })}
              >
                <option value="">{t("common.unassigned")}</option>
                {(cleaners ?? []).map((cleaner: any) => (
                  <option key={cleaner._id} value={cleaner._id}>
                    {cleaner.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">
                {t("commercialSchedules.assignedManager")}
              </span>
              <select
                className="input-field mt-1"
                value={form.assignedManagerId}
                onChange={(e) => setForm({ ...form, assignedManagerId: e.target.value })}
              >
                <option value="">{t("common.unassigned")}</option>
                {(managers ?? []).map((manager: any) => (
                  <option key={manager._id} value={manager._id}>
                    {manager.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">
                {t("commercialSchedules.assignedTeam")}
              </span>
              <select
                className="input-field mt-1"
                value={form.assignedTeamId}
                onChange={(e) => setForm({ ...form, assignedTeamId: e.target.value })}
              >
                <option value="">{t("common.unassigned")}</option>
                {(teams ?? []).map((team: any) => (
                  <option key={team._id} value={team._id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-gray-600">{t("common.notes")}</span>
            <textarea
              className="input-field mt-1"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <Save className="h-4 w-4" />
              {saving ? t("common.saving") : t("commercialSchedules.save")}
            </button>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowForm(false);
              }}
              className="btn-secondary text-sm"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {schedules.map((schedule: any) => {
          const daySummary = schedule.daysOfWeek?.length
            ? schedule.daysOfWeek.map(dayLabel).join(", ")
            : t("common.unassigned");
          return (
            <div key={schedule._id} className="rounded-lg border border-gray-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{schedule.title}</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {t(`commercialSchedules.frequencies.${schedule.frequency}`)}
                  </p>
                </div>
                <span className="badge bg-gray-100 text-gray-700">
                  {t(`commercialSchedules.statuses.${schedule.status as ScheduleStatus}`)}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {schedule.frequency === "monthly" ? (
                  <Detail
                    label={t("commercialSchedules.dayOfMonth")}
                    value={schedule.dayOfMonth ?? t("common.unassigned")}
                  />
                ) : (
                  <Detail label={t("commercialSchedules.daysOfWeek")} value={daySummary} />
                )}
                <Detail
                  label={t("commercialSchedules.startDate")}
                  value={formatDate(schedule.startDate, t("commercialAccounts.notSet"))}
                />
                <Detail
                  label={t("commercialSchedules.endDate")}
                  value={formatDate(schedule.endDate, t("commercialAccounts.notSet"))}
                />
                <Detail
                  label={t("commercialSchedules.defaultStartTime")}
                  value={schedule.defaultStartTime ?? t("common.unassigned")}
                />
                <Detail
                  label={t("commercialSchedules.defaultDueTime")}
                  value={schedule.defaultDueTime ?? t("common.unassigned")}
                />
                <Detail
                  label={t("commercialSchedules.property")}
                  value={schedule.propertyName ?? t("common.unassigned")}
                />
                <Detail
                  label={t("commercialSchedules.assignedCleaner")}
                  value={schedule.assignedCleanerName ?? t("common.unassigned")}
                />
                <Detail
                  label={t("commercialSchedules.assignedManager")}
                  value={schedule.assignedManagerName ?? t("common.unassigned")}
                />
                <Detail
                  label={t("commercialSchedules.assignedTeam")}
                  value={schedule.assignedTeamName ?? t("common.unassigned")}
                />
              </div>
              {schedule.notes && (
                <p className="mt-3 whitespace-pre-wrap text-sm text-gray-600">{schedule.notes}</p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => editSchedule(schedule)}
                  className="btn-secondary text-sm"
                >
                  {t("commercialSchedules.edit")}
                </button>
                {schedule.status === "active" && (
                  <button
                    type="button"
                    onClick={() => openGenerateForm(schedule)}
                    className="btn-secondary flex items-center gap-2 text-sm"
                  >
                    <CalendarPlus className="h-4 w-4" />
                    {t("commercialSchedules.generateJobs")}
                  </button>
                )}
                {schedule.status === "active" && (
                  <button
                    type="button"
                    onClick={() => handleStatusAction(schedule._id, "pause")}
                    disabled={actionLoading === `pause:${schedule._id}`}
                    className="btn-secondary flex items-center gap-2 text-sm"
                  >
                    <Pause className="h-4 w-4" />
                    {t("commercialSchedules.pause")}
                  </button>
                )}
                {schedule.status === "paused" && (
                  <button
                    type="button"
                    onClick={() => handleStatusAction(schedule._id, "reactivate")}
                    disabled={actionLoading === `reactivate:${schedule._id}`}
                    className="btn-primary flex items-center gap-2 text-sm"
                  >
                    <Play className="h-4 w-4" />
                    {t("commercialSchedules.reactivate")}
                  </button>
                )}
                {schedule.status !== "ended" && (
                  <button
                    type="button"
                    onClick={() => handleStatusAction(schedule._id, "end")}
                    disabled={actionLoading === `end:${schedule._id}`}
                    className="btn-danger flex items-center gap-2 text-sm"
                  >
                    <XCircle className="h-4 w-4" />
                    {t("commercialSchedules.end")}
                  </button>
                )}
                {schedule.status === "ended" && (
                  <span className="inline-flex items-center gap-1 text-sm text-gray-500">
                    <Check className="h-4 w-4" />
                    {t("commercialSchedules.ended")}
                  </span>
                )}
              </div>
              {generatingScheduleId === schedule._id && (
                <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-sm text-gray-600">
                    {t("commercialSchedules.generateHelper")}
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-xs font-medium text-gray-600">
                        {t("commercialSchedules.generateStartDate")}
                      </span>
                      <input
                        type="date"
                        className="input-field mt-1"
                        value={generateForm.startDate}
                        onChange={(e) =>
                          setGenerateForm({ ...generateForm, startDate: e.target.value })
                        }
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-gray-600">
                        {t("commercialSchedules.generateEndDate")}
                      </span>
                      <input
                        type="date"
                        className="input-field mt-1"
                        value={generateForm.endDate}
                        onChange={(e) =>
                          setGenerateForm({ ...generateForm, endDate: e.target.value })
                        }
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleGenerateJobs(schedule._id)}
                      disabled={generating || !generateForm.startDate || !generateForm.endDate}
                      className="btn-primary flex items-center gap-2 text-sm"
                    >
                      <CalendarPlus className="h-4 w-4" />
                      {generating
                        ? t("commercialSchedules.generating")
                        : t("commercialSchedules.generate")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGeneratingScheduleId(null);
                        setGenerateForm(EMPTY_GENERATE_FORM);
                      }}
                      disabled={generating}
                      className="btn-secondary text-sm"
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
