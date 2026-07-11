import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { Archive, Check, ClipboardCheck, Plus, Save, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BedroomsDisplay } from "./PropertyBedrooms";
import {
  groupsForPropertyIntelligenceType,
  propertyTypeFromLeadType,
  propertyTypeFromWalkthroughType,
  PROPERTY_INTELLIGENCE_FIELD_SET_VERSION,
  type PropertyIntelligenceField,
  type StructuredPropertyResponse,
} from "./propertyTypeFieldDefinitions";

const TYPES = [
  "commercial",
  "residential",
  "str",
  "move_in_out",
  "post_construction",
  "inspection",
  "custom",
] as const;

const LINKED_PROPERTY_INTELLIGENCE_KEYS = new Set([
  "bedCount", "amenities", "accessInstructions", "pillowCount", "sheetSets",
  "towelCount", "restroomCount", "trashCanCount",
]);

const EMPTY_PROPERTY_FORM = {
  address: "", squareFootage: "", beds: "", baths: "", amenities: [] as string[],
  accessInstructions: "", pillowCount: "", sheetSets: "", towelCount: "",
  restroomCount: "", trashCanCount: "",
};

const EMPTY_FORM = {
  title: "",
  walkthroughType: "commercial",
  scheduledDate: "",
  scheduledStartTime: "",
  scheduledEndTime: "",
  assignedManagerId: "",
  appointmentStatus: "draft",
  schedulingNotes: "",
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
  fieldSetVersion: PROPERTY_INTELLIGENCE_FIELD_SET_VERSION,
  structuredResponses: [] as StructuredPropertyResponse[],
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

function hasStructuredValue(response: StructuredPropertyResponse) {
  return (
    response.textValue !== undefined ||
    response.numberValue !== undefined ||
    response.booleanValue !== undefined ||
    (response.stringValues?.length ?? 0) > 0
  );
}

function responseDisplayValue(
  response: StructuredPropertyResponse,
  field: PropertyIntelligenceField | undefined,
  t: (key: string) => string
) {
  if (response.valueType === "boolean") {
    return response.booleanValue
      ? t("propertyIntelligence.values.yes")
      : t("propertyIntelligence.values.no");
  }
  if (response.valueType === "number") {
    return response.numberValue ?? "";
  }
  if (response.valueType === "text") {
    return response.textValue ?? "";
  }
  const values = response.stringValues ?? [];
  if (!field?.options) return values.join(", ");
  return values
    .map((value) => field.options?.find((option) => option.value === value)?.labelKey)
    .filter(Boolean)
    .map((labelKey) => t(labelKey!))
    .join(", ");
}

function formFromWalkthrough(walkthrough: any) {
  return {
    title: walkthrough.title ?? "",
    walkthroughType: walkthrough.walkthroughType ?? "commercial",
    scheduledDate: walkthrough.scheduledDate ?? "",
    scheduledStartTime: walkthrough.scheduledStartTime ?? "",
    scheduledEndTime: walkthrough.scheduledEndTime ?? "",
    assignedManagerId: walkthrough.assignedManagerId ?? "",
    appointmentStatus: walkthrough.appointmentStatus ?? (walkthrough.status === "completed" ? "completed" : walkthrough.scheduledDate ? "scheduled" : "draft"),
    schedulingNotes: walkthrough.schedulingNotes ?? "",
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
    fieldSetVersion: walkthrough.fieldSetVersion ?? PROPERTY_INTELLIGENCE_FIELD_SET_VERSION,
    structuredResponses: walkthrough.structuredResponses ?? [],
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

function legacyStructuredValue(walkthrough: any, key: string) {
  const response = (walkthrough.structuredResponses ?? []).find((item: any) => item.key === key);
  return response?.numberValue ?? response?.textValue ?? response?.stringValues;
}

function propertyFormFromWalkthrough(walkthrough: any) {
  const property = walkthrough.property;
  const numberValue = (canonical: number | undefined, topLevel: number | undefined, key?: string) => {
    const value = canonical ?? (key ? legacyStructuredValue(walkthrough, key) : undefined) ?? topLevel;
    return value != null ? String(value) : "";
  };
  const stringValue = (canonical: string | undefined, topLevel: string | undefined, key?: string) =>
    canonical?.trim() ? canonical : (key ? legacyStructuredValue(walkthrough, key) : undefined) || topLevel || "";
  const canonicalAmenities = property?.amenities;
  const legacyAmenities = legacyStructuredValue(walkthrough, "amenities");
  return {
    address: stringValue(property?.address, walkthrough.address),
    squareFootage: numberValue(property?.squareFootage, walkthrough.squareFootage),
    beds: numberValue(property?.beds, walkthrough.bedrooms, "bedCount"),
    baths: numberValue(property?.baths, walkthrough.bathrooms),
    amenities: canonicalAmenities?.length ? canonicalAmenities : Array.isArray(legacyAmenities) ? legacyAmenities : [],
    accessInstructions: stringValue(property?.accessInstructions, undefined, "accessInstructions"),
    pillowCount: numberValue(property?.pillowCount, undefined, "pillowCount"),
    sheetSets: numberValue(property?.sheetSets, undefined, "sheetSets"),
    towelCount: numberValue(property?.towelCount, undefined, "towelCount"),
    restroomCount: numberValue(property?.restroomCount, undefined, "restroomCount"),
    trashCanCount: numberValue(property?.trashCanCount, undefined, "trashCanCount"),
  };
}

function SchedulingFields({ form, setForm, managers, showStatus = false }: any) {
  return (
    <div className="grid grid-cols-1 gap-3 rounded-lg border border-primary-100 bg-primary-50/40 p-3 sm:grid-cols-2">
      <label><span className="text-xs font-medium text-gray-600">Date</span><input required type="date" className="input-field mt-1 text-sm" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} /></label>
      <label><span className="text-xs font-medium text-gray-600">Start time</span><input required type="time" className="input-field mt-1 text-sm" value={form.scheduledStartTime} onChange={(e) => setForm({ ...form, scheduledStartTime: e.target.value })} /></label>
      <label><span className="text-xs font-medium text-gray-600">End time (optional)</span><input type="time" className="input-field mt-1 text-sm" value={form.scheduledEndTime} onChange={(e) => setForm({ ...form, scheduledEndTime: e.target.value })} /></label>
      <label><span className="text-xs font-medium text-gray-600">Assigned manager</span><select className="input-field mt-1 text-sm" value={form.assignedManagerId} onChange={(e) => setForm({ ...form, assignedManagerId: e.target.value })}><option value="">Unassigned</option>{managers.map((manager: any) => <option key={manager._id} value={manager._id}>{manager.name || manager.email}</option>)}</select></label>
      {showStatus && <label><span className="text-xs font-medium text-gray-600">Appointment status</span><select className="input-field mt-1 text-sm" value={form.appointmentStatus} onChange={(e) => setForm({ ...form, appointmentStatus: e.target.value })}><option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="cancelled">Cancelled</option>{form.appointmentStatus === "completed" && <option value="completed">Completed</option>}</select></label>}
      <label className="sm:col-span-2"><span className="text-xs font-medium text-gray-600">Scheduling notes</span><textarea rows={2} className="input-field mt-1 text-sm" value={form.schedulingNotes} onChange={(e) => setForm({ ...form, schedulingNotes: e.target.value })} /></label>
    </div>
  );
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
  const [propertyForm, setPropertyForm] = useState(EMPTY_PROPERTY_FORM);

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
  const updatePropertyFacts = useMutation((api as any).mutations.properties.updateWalkthroughFacts);
  const managers = useQuery(
    api.queries.employees.getManagers,
    user?.companyId ? { companyId: user.companyId, userId: user._id } : "skip"
  );

  const walkthroughs = commercialAccountId
    ? byCommercialAccount
    : proposalId
      ? byProposal
      : byClientRequest;
  const walkthrough = (walkthroughs ?? []).find((item: any) => item.status !== "archived") ?? null;
  const isLoading = walkthroughs === undefined;
  const resolvedPropertyType =
    walkthrough?.property?.type ??
    propertyTypeFromLeadType(walkthrough?.clientRequest?.leadType) ??
    propertyTypeFromWalkthroughType(form.walkthroughType);
  const intelligenceGroups = groupsForPropertyIntelligenceType(resolvedPropertyType);
  const intelligenceFields = intelligenceGroups.flatMap((group) => group.fields);
  const linkedProperty = walkthrough?.propertyId ? walkthrough.property ?? null : null;
  const walkthroughIntelligenceGroups = linkedProperty
    ? intelligenceGroups.map((group) => ({
        ...group,
        fields: group.fields.filter((field) => !LINKED_PROPERTY_INTELLIGENCE_KEYS.has(field.key)),
      })).filter((group) => group.fields.length > 0)
    : intelligenceGroups;
  const visibleIntelligenceResponses = (walkthrough?.structuredResponses ?? [])
    .filter(hasStructuredValue)
    .filter((response: StructuredPropertyResponse) =>
      !linkedProperty || !LINKED_PROPERTY_INTELLIGENCE_KEYS.has(response.key)
    )
    .filter((response: StructuredPropertyResponse) =>
      intelligenceFields.some((field) => field.key === response.key)
    );

  useEffect(() => {
    if (!walkthrough || walkthrough._id === loadedId) return;
    setForm(formFromWalkthrough(walkthrough));
    if (walkthrough.property) setPropertyForm(propertyFormFromWalkthrough(walkthrough));
    setLoadedId(walkthrough._id);
    setEditing(false);
  }, [walkthrough, loadedId]);

  const showToast = (message: string, type: "success" | "error") => {
    onToast?.(message, type);
  };

  const responseForField = (field: PropertyIntelligenceField) =>
    form.structuredResponses.find((response) => response.key === field.key);

  const removeStructuredResponse = (field: PropertyIntelligenceField) => {
    setForm((current) => ({
      ...current,
      structuredResponses: current.structuredResponses.filter(
        (response) => response.key !== field.key
      ),
    }));
  };

  const setStructuredResponse = (
    field: PropertyIntelligenceField,
    response: StructuredPropertyResponse | null
  ) => {
    setForm((current) => {
      const remaining = current.structuredResponses.filter(
        (item) => item.key !== field.key
      );
      return {
        ...current,
        structuredResponses: response ? [...remaining, response] : remaining,
      };
    });
  };

  const renderStructuredField = (field: PropertyIntelligenceField) => {
    const response = responseForField(field);
    const label = t(field.labelKey);

    if (field.valueType === "number") {
      return (
        <label key={field.key}>
          <span className="text-xs font-medium text-gray-600">{label}</span>
          <input
            type="number"
            min="0"
            className="input-field mt-1 text-sm"
            value={response?.numberValue ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              if (!value.trim()) {
                removeStructuredResponse(field);
                return;
              }
              setStructuredResponse(field, {
                key: field.key,
                groupKey: field.groupKey,
                valueType: field.valueType,
                numberValue: Number(value),
              });
            }}
          />
        </label>
      );
    }

    if (field.valueType === "boolean") {
      return (
        <label
          key={field.key}
          className="flex items-center gap-3 rounded-md border border-gray-200 px-3 py-2"
        >
          <input
            type="checkbox"
            checked={response?.booleanValue ?? false}
            onChange={(event) =>
              setStructuredResponse(field, {
                key: field.key,
                groupKey: field.groupKey,
                valueType: field.valueType,
                booleanValue: event.target.checked,
              })
            }
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-sm font-medium text-gray-700">{label}</span>
        </label>
      );
    }

    if (field.valueType === "select") {
      return (
        <label key={field.key}>
          <span className="text-xs font-medium text-gray-600">{label}</span>
          <select
            className="input-field mt-1 text-sm"
            value={response?.stringValues?.[0] ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              if (!value) {
                removeStructuredResponse(field);
                return;
              }
              setStructuredResponse(field, {
                key: field.key,
                groupKey: field.groupKey,
                valueType: field.valueType,
                stringValues: [value],
              });
            }}
          >
            <option value="">{t("common.select")}</option>
            {(field.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (field.valueType === "multi_select") {
      const selected = response?.stringValues ?? [];
      return (
        <div key={field.key} className="sm:col-span-2">
          <p className="text-xs font-medium text-gray-600">{label}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(field.options ?? []).map((option) => {
              const active = selected.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    const next = active
                      ? selected.filter((value) => value !== option.value)
                      : [...selected, option.value];
                    if (next.length === 0) {
                      removeStructuredResponse(field);
                      return;
                    }
                    setStructuredResponse(field, {
                      key: field.key,
                      groupKey: field.groupKey,
                      valueType: field.valueType,
                      stringValues: next,
                    });
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "bg-primary-100 text-primary-700 ring-1 ring-primary-300"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {t(option.labelKey)}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <label key={field.key} className="sm:col-span-2">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        <textarea
          className="input-field mt-1 text-sm"
          rows={3}
          value={response?.textValue ?? ""}
          onChange={(event) => {
            const value = event.target.value;
            if (!value.trim()) {
              removeStructuredResponse(field);
              return;
            }
            setStructuredResponse(field, {
              key: field.key,
              groupKey: field.groupKey,
              valueType: field.valueType,
              textValue: value,
            });
          }}
        />
      </label>
    );
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
    scheduledStartTime: form.scheduledStartTime || undefined,
    scheduledEndTime: form.scheduledEndTime || undefined,
    assignedManagerId: form.assignedManagerId || undefined,
    appointmentStatus: form.appointmentStatus,
    schedulingNotes: form.schedulingNotes || undefined,
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
    fieldSetVersion: PROPERTY_INTELLIGENCE_FIELD_SET_VERSION,
    structuredResponses: form.structuredResponses,
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
      if (!form.scheduledDate || !form.scheduledStartTime) {
        showToast("Select a walkthrough date and start time", "error");
        return;
      }
      await createFromLead({
        userId: user._id,
        clientRequestId,
        scheduledDate: form.scheduledDate,
        scheduledStartTime: form.scheduledStartTime,
        scheduledEndTime: form.scheduledEndTime || undefined,
        assignedManagerId: form.assignedManagerId || undefined,
        schedulingNotes: form.schedulingNotes || undefined,
      });
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
      if (linkedProperty) {
        await updatePropertyFacts({
          userId: user!._id,
          propertyId: linkedProperty._id,
          address: propertyForm.address,
          squareFootage: optionalNumber(propertyForm.squareFootage, t("walkthroughs.invalidNumber")),
          beds: optionalNumber(propertyForm.beds, t("walkthroughs.invalidNumber")),
          baths: optionalNumber(propertyForm.baths, t("walkthroughs.invalidNumber")),
          amenities: propertyForm.amenities,
          accessInstructions: propertyForm.accessInstructions || undefined,
          pillowCount: optionalNumber(propertyForm.pillowCount, t("walkthroughs.invalidNumber")),
          sheetSets: optionalNumber(propertyForm.sheetSets, t("walkthroughs.invalidNumber")),
          towelCount: optionalNumber(propertyForm.towelCount, t("walkthroughs.invalidNumber")),
          restroomCount: optionalNumber(propertyForm.restroomCount, t("walkthroughs.invalidNumber")),
          trashCanCount: optionalNumber(propertyForm.trashCanCount, t("walkthroughs.invalidNumber")),
        });
      }
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
          editing ? (
            <div className="space-y-3">
              <SchedulingFields form={form} setForm={setForm} managers={managers ?? []} />
              <div className="flex gap-2">
                <button type="button" onClick={handleCreate} disabled={saving} className="btn-primary text-sm">{saving ? t("common.saving") : "Schedule Walkthrough"}</button>
                <button type="button" onClick={() => setEditing(false)} className="btn-secondary text-sm">{t("common.cancel")}</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="btn-primary flex w-full items-center justify-center gap-2 text-sm sm:w-auto">
              <Plus className="h-4 w-4" /> Schedule Walkthrough
            </button>
          )
        ) : (
          <p className="text-sm text-gray-500">{t("walkthroughs.noneLinked")}</p>
        )
      ) : editing ? (
        <div className="space-y-4">
          <SchedulingFields form={form} setForm={setForm} managers={managers ?? []} showStatus />
          {linkedProperty && (
            <div className="space-y-3 rounded-md border border-primary-200 bg-primary-50/30 p-3">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">{t("walkthroughs.propertyInformation")}</h4>
                <p className="text-xs text-gray-500">{t("walkthroughs.propertyInformationHelper")}</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="sm:col-span-2"><span className="text-xs font-medium text-gray-600">{t("walkthroughs.fields.address")}</span><input className="input-field mt-1 text-sm" value={propertyForm.address} onChange={(e) => setPropertyForm({ ...propertyForm, address: e.target.value })} /></label>
                {(["squareFootage", "beds", "baths", "pillowCount", "sheetSets", "towelCount", "restroomCount", "trashCanCount"] as const).map((key) => (
                  <label key={key}><span className="text-xs font-medium text-gray-600">{t(`properties.${key}`)}</span><input type="number" min="0" className="input-field mt-1 text-sm" value={propertyForm[key]} onChange={(e) => setPropertyForm({ ...propertyForm, [key]: e.target.value })} /></label>
                ))}
                <label className="sm:col-span-2"><span className="text-xs font-medium text-gray-600">{t("properties.accessInstructions")}</span><textarea rows={3} className="input-field mt-1 text-sm" value={propertyForm.accessInstructions} onChange={(e) => setPropertyForm({ ...propertyForm, accessInstructions: e.target.value })} /></label>
                <label className="sm:col-span-2"><span className="text-xs font-medium text-gray-600">{t("properties.amenities")}</span><input className="input-field mt-1 text-sm" value={propertyForm.amenities.join(", ")} onChange={(e) => setPropertyForm({ ...propertyForm, amenities: e.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} /></label>
              </div>
              {linkedProperty.bedrooms?.length > 0 && <div><p className="mb-2 text-xs font-medium text-gray-600">{t("properties.bedroomProfile.title")}</p><BedroomsDisplay bedrooms={linkedProperty.bedrooms} compact /></div>}
            </div>
          )}
          <div>
            <h4 className="text-sm font-semibold text-gray-900">{t("walkthroughs.findings")}</h4>
            <p className="text-xs text-gray-500">{t("walkthroughs.findingsHelper")}</p>
          </div>
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
            {!linkedProperty && <label className="sm:col-span-2">
              <span className="text-xs font-medium text-gray-600">{t("walkthroughs.fields.address")}</span>
              <input className="input-field mt-1 text-sm" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </label>}
            {[
              ...(!linkedProperty ? [["squareFootage", "number"], ["bedrooms", "number"], ["bathrooms", "number"]] : []),
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

          <div className="space-y-4 border-t pt-4">
            <div>
              <h4 className="text-sm font-semibold text-gray-900">
                {t("propertyIntelligence.title")}
              </h4>
              <p className="text-xs text-gray-500">
                {t("propertyIntelligence.helper")}
              </p>
            </div>
            {walkthroughIntelligenceGroups.map((group) => (
              <div key={group.key} className="space-y-3 rounded-md border border-gray-200 p-3">
                <h5 className="text-xs font-semibold uppercase text-gray-500">
                  {t(group.titleKey)}
                </h5>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {group.fields.map((field) => renderStructuredField(field))}
                </div>
              </div>
            ))}
          </div>

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
          {linkedProperty && (
            <div className="rounded-md border border-primary-200 bg-primary-50/30 p-3">
              <h4 className="text-sm font-semibold text-gray-900">{t("walkthroughs.propertyInformation")}</h4>
              <p className="text-xs text-gray-500">{t("walkthroughs.propertyInformationHelper")}</p>
              <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                <div className="sm:col-span-3"><p className="text-xs font-medium text-gray-500">{t("walkthroughs.fields.address")}</p><p>{propertyFormFromWalkthrough(walkthrough).address || t("common.unassigned")}</p></div>
                {(["squareFootage", "beds", "baths", "pillowCount", "sheetSets", "towelCount", "restroomCount", "trashCanCount"] as const).map((key) => <div key={key}><p className="text-xs font-medium text-gray-500">{t(`properties.${key}`)}</p><p>{propertyFormFromWalkthrough(walkthrough)[key] || t("common.unassigned")}</p></div>)}
                <div className="sm:col-span-3"><p className="text-xs font-medium text-gray-500">{t("properties.accessInstructions")}</p><p className="whitespace-pre-wrap">{propertyFormFromWalkthrough(walkthrough).accessInstructions || t("common.unassigned")}</p></div>
                <div className="sm:col-span-3"><p className="text-xs font-medium text-gray-500">{t("properties.amenities")}</p><p>{propertyFormFromWalkthrough(walkthrough).amenities.join(", ") || t("common.unassigned")}</p></div>
              </div>
              {linkedProperty.bedrooms?.length > 0 && <div className="mt-3"><p className="mb-2 text-xs font-medium text-gray-500">{t("properties.bedroomProfile.title")}</p><BedroomsDisplay bedrooms={linkedProperty.bedrooms} compact /></div>}
            </div>
          )}
          <div><h4 className="text-sm font-semibold text-gray-900">{t("walkthroughs.findings")}</h4><p className="text-xs text-gray-500">{t("walkthroughs.findingsHelper")}</p></div>
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
            <div><p className="text-xs font-medium text-gray-500">Scheduled time</p><p className="mt-1 text-gray-900">{walkthrough.scheduledStartTime ? `${walkthrough.scheduledStartTime}${walkthrough.scheduledEndTime ? `–${walkthrough.scheduledEndTime}` : ""}` : t("common.unassigned")}</p></div>
            <div><p className="text-xs font-medium text-gray-500">Assigned manager</p><p className="mt-1 text-gray-900">{walkthrough.assignedManager?.name || t("common.unassigned")}</p></div>
            <div><p className="text-xs font-medium text-gray-500">Appointment status</p><p className="mt-1 capitalize text-gray-900">{walkthrough.appointmentStatus ?? (walkthrough.status === "completed" ? "completed" : "draft")}</p></div>
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
          {visibleIntelligenceResponses.length > 0 && (
            <div className="space-y-3 rounded-md border border-gray-200 p-3">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">
                  {t("propertyIntelligence.title")}
                </h4>
                <p className="text-xs text-gray-500">
                  {t("propertyIntelligence.summaryHelper")}
                </p>
              </div>
              {walkthroughIntelligenceGroups.map((group) => {
                const groupResponses = visibleIntelligenceResponses.filter(
                  (response: StructuredPropertyResponse) => response.groupKey === group.key
                );
                if (groupResponses.length === 0) return null;
                return (
                  <div key={group.key}>
                    <p className="text-xs font-semibold uppercase text-gray-500">
                      {t(group.titleKey)}
                    </p>
                    <div className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                      {groupResponses.map((response: StructuredPropertyResponse) => {
                        const field = group.fields.find((item) => item.key === response.key);
                        return (
                          <div key={response.key}>
                            <p className="text-xs font-medium text-gray-500">
                              {field ? t(field.labelKey) : response.key}
                            </p>
                            <p className="mt-0.5 text-gray-900">
                              {responseDisplayValue(response, field, t)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setEditing(true)} className="btn-secondary text-sm">
              {t("walkthroughs.edit")}
            </button>
            {walkthrough.status === "draft" && walkthrough.appointmentStatus !== "cancelled" && (
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
