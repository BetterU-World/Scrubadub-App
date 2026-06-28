import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { Archive, Check, ClipboardCheck, Plus, Save, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

const TYPES = [
  "commercial",
  "residential",
  "str",
  "move_in_out",
  "post_construction",
  "inspection",
  "custom",
] as const;

const EMPTY_FORM = {
  title: "",
  walkthroughType: "commercial",
  scheduledDate: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  address: "",
  squareFootage: "",
  bedrooms: "",
  bathrooms: "",
  serviceFrequencyRecommendation: "",
  estimatedHours: "",
  recommendedCleanerCount: "",
  estimatedMonthlyValue: "",
  scopeNotes: "",
  supplyNotes: "",
  accessNotes: "",
  riskNotes: "",
  staffingNotes: "",
  proposalNotes: "",
  rooms: [] as Array<{
    name: string;
    roomType: string;
    condition: string;
    estimatedMinutes: string;
    notes: string;
  }>,
  photos: [] as Array<{ url: string; caption: string }>,
};

type WalkthroughCardProps = {
  clientRequestId?: Id<"clientRequests">;
  commercialAccountId?: Id<"commercialAccounts">;
  proposalId?: Id<"proposals">;
  compact?: boolean;
  allowCreate?: boolean;
  onToast?: (message: string, type: "success" | "error") => void;
};

function centsFromPrice(value: string, error: string) {
  if (!value.trim()) return undefined;
  const cents = Math.round(Number(value) * 100);
  if (!Number.isFinite(cents) || cents < 0) throw new Error(error);
  return cents;
}

function optionalNumber(value: string, error: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(error);
  return parsed;
}

function money(cents: number | undefined, fallback: string) {
  if (cents == null) return fallback;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function dateLabel(date: string | undefined, fallback: string) {
  if (!date) return fallback;
  return new Date(`${date}T00:00:00`).toLocaleDateString();
}

function formFromWalkthrough(walkthrough: any) {
  return {
    title: walkthrough.title ?? "",
    walkthroughType: walkthrough.walkthroughType ?? "commercial",
    scheduledDate: walkthrough.scheduledDate ?? "",
    contactName: walkthrough.contactName ?? "",
    contactEmail: walkthrough.contactEmail ?? "",
    contactPhone: walkthrough.contactPhone ?? "",
    address: walkthrough.address ?? "",
    squareFootage: walkthrough.squareFootage != null ? String(walkthrough.squareFootage) : "",
    bedrooms: walkthrough.bedrooms != null ? String(walkthrough.bedrooms) : "",
    bathrooms: walkthrough.bathrooms != null ? String(walkthrough.bathrooms) : "",
    serviceFrequencyRecommendation: walkthrough.serviceFrequencyRecommendation ?? "",
    estimatedHours: walkthrough.estimatedHours != null ? String(walkthrough.estimatedHours) : "",
    recommendedCleanerCount:
      walkthrough.recommendedCleanerCount != null ? String(walkthrough.recommendedCleanerCount) : "",
    estimatedMonthlyValue:
      walkthrough.estimatedMonthlyValueCents != null
        ? String(walkthrough.estimatedMonthlyValueCents / 100)
        : "",
    scopeNotes: walkthrough.scopeNotes ?? "",
    supplyNotes: walkthrough.supplyNotes ?? "",
    accessNotes: walkthrough.accessNotes ?? "",
    riskNotes: walkthrough.riskNotes ?? "",
    staffingNotes: walkthrough.staffingNotes ?? "",
    proposalNotes: walkthrough.proposalNotes ?? "",
    rooms: (walkthrough.rooms ?? []).map((room: any) => ({
      name: room.name ?? "",
      roomType: room.roomType ?? "",
      condition: room.condition ?? "",
      estimatedMinutes: room.estimatedMinutes != null ? String(room.estimatedMinutes) : "",
      notes: room.notes ?? "",
    })),
    photos: (walkthrough.photos ?? []).map((photo: any) => ({
      url: photo.url ?? "",
      caption: photo.caption ?? "",
    })),
  };
}

export function WalkthroughCard({
  clientRequestId,
  commercialAccountId,
  proposalId,
  compact = false,
  allowCreate = false,
  onToast,
}: WalkthroughCardProps) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const byClientRequest = useQuery(
    (api as any).queries.walkthroughs.listByClientRequest,
    user && clientRequestId && !commercialAccountId && !proposalId
      ? { userId: user._id, clientRequestId }
      : "skip"
  );
  const byCommercialAccount = useQuery(
    (api as any).queries.walkthroughs.listByCommercialAccount,
    user && commercialAccountId
      ? { userId: user._id, commercialAccountId }
      : "skip"
  );
  const byProposal = useQuery(
    (api as any).queries.walkthroughs.listByProposal,
    user && proposalId && !commercialAccountId
      ? { userId: user._id, proposalId }
      : "skip"
  );

  const createFromLead = useMutation((api as any).mutations.walkthroughs.createFromClientRequest);
  const updateWalkthrough = useMutation((api as any).mutations.walkthroughs.update);
  const completeWalkthrough = useMutation((api as any).mutations.walkthroughs.complete);
  const archiveWalkthrough = useMutation((api as any).mutations.walkthroughs.archive);

  const walkthroughs = commercialAccountId
    ? byCommercialAccount
    : proposalId
      ? byProposal
      : byClientRequest;
  const walkthrough = (walkthroughs ?? []).find((item: any) => item.status !== "archived") ?? null;
  const isLoading = walkthroughs === undefined;

  useEffect(() => {
    if (!walkthrough || walkthrough._id === loadedId) return;
    setForm(formFromWalkthrough(walkthrough));
    setLoadedId(walkthrough._id);
    setEditing(false);
  }, [walkthrough, loadedId]);

  const showToast = (message: string, type: "success" | "error") => {
    onToast?.(message, type);
  };

  const payloadFromForm = (current: any) => ({
    userId: user!._id,
    walkthroughId: current._id,
    clientRequestId: current.clientRequestId,
    propertyId: current.propertyId,
    commercialAccountId: current.commercialAccountId,
    proposalId: current.proposalId,
    title: form.title,
    walkthroughType: form.walkthroughType,
    scheduledDate: form.scheduledDate || undefined,
    contactName: form.contactName || undefined,
    contactEmail: form.contactEmail || undefined,
    contactPhone: form.contactPhone || undefined,
    address: form.address || undefined,
    squareFootage: optionalNumber(form.squareFootage, t("walkthroughs.invalidNumber")),
    bedrooms: optionalNumber(form.bedrooms, t("walkthroughs.invalidNumber")),
    bathrooms: optionalNumber(form.bathrooms, t("walkthroughs.invalidNumber")),
    serviceFrequencyRecommendation: form.serviceFrequencyRecommendation || undefined,
    estimatedHours: optionalNumber(form.estimatedHours, t("walkthroughs.invalidNumber")),
    recommendedCleanerCount: optionalNumber(form.recommendedCleanerCount, t("walkthroughs.invalidNumber")),
    estimatedMonthlyValueCents: centsFromPrice(
      form.estimatedMonthlyValue,
      t("walkthroughs.invalidAmount")
    ),
    scopeNotes: form.scopeNotes || undefined,
    supplyNotes: form.supplyNotes || undefined,
    accessNotes: form.accessNotes || undefined,
    riskNotes: form.riskNotes || undefined,
    staffingNotes: form.staffingNotes || undefined,
    proposalNotes: form.proposalNotes || undefined,
    rooms: form.rooms.map((room) => ({
      name: room.name,
      roomType: room.roomType,
      condition: room.condition || undefined,
      estimatedMinutes: optionalNumber(room.estimatedMinutes, t("walkthroughs.invalidNumber")),
      notes: room.notes || undefined,
    })),
    photos: form.photos.map((photo) => ({
      url: photo.url,
      caption: photo.caption || undefined,
      uploadedAt: Date.now(),
    })),
  });

  const handleCreate = async () => {
    if (!clientRequestId || !user) return;
    setSaving(true);
    try {
      await createFromLead({ userId: user._id, clientRequestId });
      showToast(t("walkthroughs.created"), "success");
    } catch (err: any) {
      showToast(err.message || t("walkthroughs.createFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!walkthrough) return;
    setSaving(true);
    try {
      await updateWalkthrough(payloadFromForm(walkthrough));
      setEditing(false);
      showToast(t("walkthroughs.saved"), "success");
    } catch (err: any) {
      showToast(err.message || t("walkthroughs.saveFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    if (!walkthrough || !user) return;
    setSaving(true);
    try {
      await completeWalkthrough({ userId: user._id, walkthroughId: walkthrough._id });
      showToast(t("walkthroughs.completed"), "success");
    } catch (err: any) {
      showToast(err.message || t("walkthroughs.actionFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!walkthrough || !user) return;
    setSaving(true);
    try {
      await archiveWalkthrough({ userId: user._id, walkthroughId: walkthrough._id });
      showToast(t("walkthroughs.archived"), "success");
    } catch (err: any) {
      showToast(err.message || t("walkthroughs.actionFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  if (!user || isLoading) return null;
  if (!walkthrough && compact) return null;

  return (
    <section className={compact ? "rounded-lg border border-gray-200 p-3" : "card mt-4 space-y-4"}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2">
          <ClipboardCheck className="mt-0.5 h-4 w-4 text-gray-500" />
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{t("walkthroughs.title")}</h3>
            <p className="text-xs text-gray-500">{t("walkthroughs.helper")}</p>
            {walkthrough?.clientRelationship && (
              <p className="mt-2 inline-flex rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">
                Client relationship: {walkthrough.clientRelationship.displayName}
              </p>
            )}
          </div>
        </div>
        {walkthrough && (
          <span className="badge self-start bg-primary-50 text-primary-700">
            {t(`walkthroughs.statuses.${walkthrough.status}`)}
          </span>
        )}
      </div>

      {!walkthrough ? (
        allowCreate ? (
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving}
            className="btn-primary flex w-full items-center justify-center gap-2 text-sm sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            {saving ? t("common.saving") : t("walkthroughs.create")}
          </button>
        ) : (
          <p className="text-sm text-gray-500">{t("walkthroughs.noneLinked")}</p>
        )
      ) : editing ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label>
              <span className="text-xs font-medium text-gray-600">{t("walkthroughs.fields.formTitle")}</span>
              <input className="input-field mt-1 text-sm" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label>
              <span className="text-xs font-medium text-gray-600">{t("walkthroughs.fields.type")}</span>
              <select className="input-field mt-1 text-sm" value={form.walkthroughType} onChange={(e) => setForm({ ...form, walkthroughType: e.target.value })}>
                {TYPES.map((type) => (
                  <option key={type} value={type}>{t(`walkthroughs.types.${type}`)}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-xs font-medium text-gray-600">{t("walkthroughs.fields.scheduledDate")}</span>
              <input type="date" className="input-field mt-1 text-sm" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} />
            </label>
            <label>
              <span className="text-xs font-medium text-gray-600">{t("walkthroughs.fields.contactName")}</span>
              <input className="input-field mt-1 text-sm" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
            </label>
            <label>
              <span className="text-xs font-medium text-gray-600">{t("walkthroughs.fields.contactEmail")}</span>
              <input className="input-field mt-1 text-sm" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
            </label>
            <label>
              <span className="text-xs font-medium text-gray-600">{t("walkthroughs.fields.contactPhone")}</span>
              <input className="input-field mt-1 text-sm" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
            </label>
            <label className="sm:col-span-2">
              <span className="text-xs font-medium text-gray-600">{t("walkthroughs.fields.address")}</span>
              <input className="input-field mt-1 text-sm" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </label>
            {[
              ["squareFootage", "number"],
              ["bedrooms", "number"],
              ["bathrooms", "number"],
              ["estimatedHours", "number"],
              ["recommendedCleanerCount", "number"],
              ["estimatedMonthlyValue", "number"],
            ].map(([key, type]) => (
              <label key={key}>
                <span className="text-xs font-medium text-gray-600">{t(`walkthroughs.fields.${key}`)}</span>
                <input
                  type={type}
                  min="0"
                  step={key === "estimatedMonthlyValue" ? "0.01" : "1"}
                  className="input-field mt-1 text-sm"
                  value={(form as any)[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </label>
            ))}
            <label className="sm:col-span-2">
              <span className="text-xs font-medium text-gray-600">{t("walkthroughs.fields.frequency")}</span>
              <input className="input-field mt-1 text-sm" value={form.serviceFrequencyRecommendation} onChange={(e) => setForm({ ...form, serviceFrequencyRecommendation: e.target.value })} />
            </label>
          </div>

          {[
            "scopeNotes",
            "supplyNotes",
            "accessNotes",
            "riskNotes",
            "staffingNotes",
            "proposalNotes",
          ].map((key) => (
            <label key={key} className="block">
              <span className="text-xs font-medium text-gray-600">{t(`walkthroughs.fields.${key}`)}</span>
              <textarea
                className="input-field mt-1 text-sm"
                rows={3}
                value={(form as any)[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}

          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-gray-900">{t("walkthroughs.rooms")}</h4>
              <button
                type="button"
                className="btn-secondary flex items-center gap-2 px-2 py-1 text-xs"
                onClick={() =>
                  setForm({
                    ...form,
                    rooms: [...form.rooms, { name: "", roomType: "", condition: "", estimatedMinutes: "", notes: "" }],
                  })
                }
              >
                <Plus className="h-3 w-3" />
                {t("walkthroughs.addRoom")}
              </button>
            </div>
            {form.rooms.map((room, index) => (
              <div key={index} className="rounded-md border border-gray-200 p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(["name", "roomType", "condition", "estimatedMinutes"] as const).map((field) => (
                    <label key={field}>
                      <span className="text-xs font-medium text-gray-600">{t(`walkthroughs.roomFields.${field}`)}</span>
                      <input
                        type={field === "estimatedMinutes" ? "number" : "text"}
                        min="0"
                        className="input-field mt-1 text-sm"
                        value={room[field]}
                        onChange={(e) => {
                          const rooms = [...form.rooms];
                          rooms[index] = { ...room, [field]: e.target.value };
                          setForm({ ...form, rooms });
                        }}
                      />
                    </label>
                  ))}
                  <label className="sm:col-span-2">
                    <span className="text-xs font-medium text-gray-600">{t("walkthroughs.roomFields.notes")}</span>
                    <textarea
                      className="input-field mt-1 text-sm"
                      rows={2}
                      value={room.notes}
                      onChange={(e) => {
                        const rooms = [...form.rooms];
                        rooms[index] = { ...room, notes: e.target.value };
                        setForm({ ...form, rooms });
                      }}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="mt-3 flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700"
                  onClick={() => setForm({ ...form, rooms: form.rooms.filter((_, i) => i !== index) })}
                >
                  <Trash2 className="h-3 w-3" />
                  {t("walkthroughs.removeRoom")}
                </button>
              </div>
            ))}
          </div>

          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">{t("walkthroughs.photos")}</h4>
                <p className="text-xs text-gray-500">{t("walkthroughs.photoTodo")}</p>
              </div>
              <button
                type="button"
                className="btn-secondary flex items-center gap-2 px-2 py-1 text-xs"
                onClick={() => setForm({ ...form, photos: [...form.photos, { url: "", caption: "" }] })}
              >
                <Plus className="h-3 w-3" />
                {t("walkthroughs.addPhoto")}
              </button>
            </div>
            {form.photos.map((photo, index) => (
              <div key={index} className="grid grid-cols-1 gap-3 rounded-md border border-gray-200 p-3 sm:grid-cols-[1fr_1fr_auto]">
                <input
                  className="input-field text-sm"
                  placeholder={t("walkthroughs.photoUrl")}
                  value={photo.url}
                  onChange={(e) => {
                    const photos = [...form.photos];
                    photos[index] = { ...photo, url: e.target.value };
                    setForm({ ...form, photos });
                  }}
                />
                <input
                  className="input-field text-sm"
                  placeholder={t("walkthroughs.photoCaption")}
                  value={photo.caption}
                  onChange={(e) => {
                    const photos = [...form.photos];
                    photos[index] = { ...photo, caption: e.target.value };
                    setForm({ ...form, photos });
                  }}
                />
                <button
                  type="button"
                  className="p-2 text-red-600 hover:text-red-700"
                  onClick={() => setForm({ ...form, photos: form.photos.filter((_, i) => i !== index) })}
                  title={t("walkthroughs.removePhoto")}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2 text-sm">
              <Save className="h-4 w-4" />
              {saving ? t("common.saving") : t("common.save")}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="btn-secondary flex items-center gap-2 text-sm">
              <X className="h-4 w-4" />
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-gray-500">{t("walkthroughs.fields.formTitle")}</p>
              <p className="mt-1 font-medium text-gray-900">{walkthrough.title}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">{t("walkthroughs.fields.type")}</p>
              <p className="mt-1 text-gray-900">{t(`walkthroughs.types.${walkthrough.walkthroughType}`)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">{t("walkthroughs.fields.scheduledDate")}</p>
              <p className="mt-1 text-gray-900">{dateLabel(walkthrough.scheduledDate, t("common.unassigned"))}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">{t("walkthroughs.fields.frequency")}</p>
              <p className="mt-1 text-gray-900">{walkthrough.serviceFrequencyRecommendation || t("common.unassigned")}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">{t("walkthroughs.fields.estimatedHours")}</p>
              <p className="mt-1 text-gray-900">{walkthrough.estimatedHours ?? t("common.unassigned")}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">{t("walkthroughs.fields.estimatedMonthlyValue")}</p>
              <p className="mt-1 text-gray-900">{money(walkthrough.estimatedMonthlyValueCents, t("common.unassigned"))}</p>
            </div>
          </div>
          {walkthrough.scopeNotes && (
            <p className="whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-sm text-gray-700">
              {walkthrough.scopeNotes}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setEditing(true)} className="btn-secondary text-sm">
              {t("walkthroughs.edit")}
            </button>
            {walkthrough.status === "draft" && (
              <button type="button" onClick={handleComplete} disabled={saving} className="btn-primary flex items-center gap-2 text-sm">
                <Check className="h-4 w-4" />
                {t("walkthroughs.markCompleted")}
              </button>
            )}
            <button type="button" onClick={handleArchive} disabled={saving} className="btn-danger flex items-center gap-2 text-sm">
              <Archive className="h-4 w-4" />
              {t("walkthroughs.archive")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
