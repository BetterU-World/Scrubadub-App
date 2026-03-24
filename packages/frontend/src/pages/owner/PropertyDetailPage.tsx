import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useParams, Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_LABELS,
} from "../../../../../convex/lib/constants";

const AMENITY_KEYS: Record<string, string> = {
  "Washer/Dryer": "properties.amenityPresets.washerDryer",
  "Hot Tub": "properties.amenityPresets.hotTub",
  "Pool": "properties.amenityPresets.pool",
  "BBQ Grill": "properties.amenityPresets.bbqGrill",
  "Pets Allowed": "properties.amenityPresets.petsAllowed",
  "Stairs": "properties.amenityPresets.stairs",
  "Elevator": "properties.amenityPresets.elevator",
  "Oceanfront": "properties.amenityPresets.oceanfront",
  "Smart Lock": "properties.amenityPresets.smartLock",
  "Garage": "properties.amenityPresets.garage",
};

const RESTOCK_OPTIONS = ["owner", "cleaner", "manager"] as const;

import {
  MapPin,
  Key,
  Wrench,
  Pencil,
  Archive,
  RotateCcw,
  Lock,
  Clock,
  Flag,
  Briefcase,
  AlertTriangle,
  Package,
  Plus,
  Trash2,
  X,
  ClipboardList,
} from "lucide-react";

type Tab = "details" | "inventory" | "history";

export function PropertyDetailPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>("details");
  const [toast, setToast] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  // Read flash toast from sessionStorage (set by PropertyFormPage)
  useEffect(() => {
    const msg = sessionStorage.getItem("scrubadub_toast");
    if (msg) {
      sessionStorage.removeItem("scrubadub_toast");
      setToast(msg);
      setTimeout(() => setToast(null), 3000);
    }
  }, []);

  const property = useQuery(api.queries.properties.get,
    user ? { propertyId: params.id as Id<"properties">, userId: user._id } : "skip"
  );
  const toggleActive = useMutation(api.mutations.properties.toggleActive);

  const history = useQuery(
    api.queries.properties.getHistory,
    activeTab === "history" && user ? { propertyId: params.id as Id<"properties">, userId: user._id } : "skip"
  );

  if (property === undefined) return <PageLoader />;
  if (property === null)
    return <div className="text-center py-12 text-gray-500">{t("properties.notFound")}</div>;

  return (
    <div className="max-w-3xl mx-auto">
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium bg-green-600 text-white">
          {toast}
        </div>
      )}
      <ConfirmDialog
        open={showArchiveConfirm}
        onOpenChange={setShowArchiveConfirm}
        title={property.active ? t("properties.archiveConfirmTitle") : t("properties.restoreConfirmTitle")}
        description={property.active ? t("properties.archiveConfirmDesc") : t("properties.restoreConfirmDesc")}
        confirmLabel={property.active ? t("properties.archiveProperty") : t("properties.restoreProperty")}
        confirmVariant={property.active ? "danger" : "primary"}
        onConfirm={async () => {
          setToggling(true);
          try {
            await toggleActive({ propertyId: property._id, userId: user!._id });
            setShowArchiveConfirm(false);
          } finally {
            setToggling(false);
          }
        }}
        loading={toggling}
      />

      <PageHeader
        title={property.name}
        action={
          <div className="flex gap-2">
            <button
              onClick={() => setShowArchiveConfirm(true)}
              className="btn-secondary flex items-center gap-2"
            >
              {property.active ? (
                <Archive className="w-4 h-4" />
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
              {property.active ? t("properties.archive") : t("properties.restoreProperty")}
            </button>
            <Link href={`/properties/${property._id}/edit`} className="btn-primary flex items-center gap-2">
              <Pencil className="w-4 h-4" /> {t("common.edit")}
            </Link>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab("details")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "details"
              ? "border-primary-600 text-primary-600"
              : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
          }`}
        >
          {t("properties.details")}
        </button>
        <button
          onClick={() => setActiveTab("inventory")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === "inventory"
              ? "border-primary-600 text-primary-600"
              : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
          }`}
        >
          <Package className="w-4 h-4" />
          {t("properties.inventory.title")}
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === "history"
              ? "border-primary-600 text-primary-600"
              : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
          }`}
        >
          <Clock className="w-4 h-4" />
          {t("properties.history")}
        </button>
      </div>

      {activeTab === "details" && <DetailsTab property={property} />}
      {activeTab === "inventory" && (
        <InventoryTab
          property={property}
          userId={user!._id}
        />
      )}
      {activeTab === "history" && (
        <HistoryTab
          propertyId={params.id as Id<"properties">}
          history={history}
        />
      )}
    </div>
  );
}

function DetailsTab({ property }: { property: any }) {
  const { t } = useTranslation();
  const hasBathroomDetails =
    property.hasStandaloneTub || property.showerGlassDoorCount != null;
  const hasStructuredAmenities =
    property.towelCount != null ||
    property.sheetSets != null ||
    property.pillowCount != null ||
    property.linenCount != null;

  return (
    <div className="card space-y-6">
      <div className="flex items-center gap-2">
        <StatusBadge status={property.active ? "active" : "inactive"} />
        <span className="text-sm text-gray-500 capitalize">
          {t(`properties.propertyTypes.${property.type}`, property.type.replace(/_/g, " "))}
        </span>
      </div>

      <div>
        <div className="flex items-center gap-2 text-gray-700">
          <MapPin className="w-4 h-4 text-gray-400" />
          <span>{property.address}</span>
        </div>
      </div>

      {(property.beds != null || property.baths != null) && (
        <div className="grid grid-cols-2 gap-4">
          {property.beds != null && (
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-semibold text-gray-800">{property.beds}</div>
              <div className="text-xs text-gray-500 mt-1">{t("properties.beds")}</div>
            </div>
          )}
          {property.baths != null && (
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-semibold text-gray-800">{property.baths}</div>
              <div className="text-xs text-gray-500 mt-1">{t("properties.baths")}</div>
            </div>
          )}
        </div>
      )}

      {hasBathroomDetails && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-2">{t("properties.bathroomDetails")}</h3>
          <div className="flex flex-wrap gap-3">
            {property.hasStandaloneTub && (
              <span className="badge bg-blue-100 text-blue-700">{t("properties.standaloneTub")}</span>
            )}
            {property.showerGlassDoorCount != null && (
              <span className="badge bg-blue-100 text-blue-700">
                {property.showerGlassDoorCount} {property.showerGlassDoorCount !== 1 ? t("properties.showerGlassDoors") : t("properties.showerGlassDoor")}
              </span>
            )}
          </div>
        </div>
      )}

      {property.accessInstructions && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-1 flex items-center gap-1">
            <Key className="w-4 h-4" /> {t("properties.accessInstructions")}
          </h3>
          <p className="text-gray-700 whitespace-pre-wrap">
            {property.accessInstructions}
          </p>
        </div>
      )}

      {property.amenities.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-2">{t("properties.amenities")}</h3>
          <div className="flex flex-wrap gap-2">
            {property.amenities.map((a: string) => (
              <span key={a} className="badge bg-primary-100 text-primary-700">
                {AMENITY_KEYS[a] ? t(AMENITY_KEYS[a]) : a}
              </span>
            ))}
          </div>
        </div>
      )}

      {hasStructuredAmenities && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-2">
            {t("properties.linenSupplyCounts")}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {property.sheetSets != null && (
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-semibold text-gray-800">
                  {property.sheetSets}
                </div>
                <div className="text-xs text-gray-500 mt-1">{t("properties.sheetSets")}</div>
              </div>
            )}
            {property.linenCount != null && (
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-semibold text-gray-800">
                  {property.linenCount}
                </div>
                <div className="text-xs text-gray-500 mt-1">{t("properties.spareSheetSets")}</div>
              </div>
            )}
            {property.towelCount != null && (
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-semibold text-gray-800">
                  {property.towelCount}
                </div>
                <div className="text-xs text-gray-500 mt-1">{t("properties.towels")}</div>
              </div>
            )}
            {property.pillowCount != null && (
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-semibold text-gray-800">
                  {property.pillowCount}
                </div>
                <div className="text-xs text-gray-500 mt-1">{t("properties.pillows")}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {property.maintenanceNotes && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-1 flex items-center gap-1">
            <Wrench className="w-4 h-4" /> {t("properties.maintenanceNotes")}
          </h3>
          <p className="text-gray-700 whitespace-pre-wrap">
            {property.maintenanceNotes}
          </p>
        </div>
      )}

      {property.ownerNotes && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-1 flex items-center gap-1">
            <Lock className="w-4 h-4" /> {t("properties.ownerNotes")}
          </h3>
          <p className="text-gray-700 whitespace-pre-wrap">
            {property.ownerNotes}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Inventory Tab ──────────────────────────────────────────────────────

interface InventoryItem {
  name: string;
  category: string;
  parLevel: number;
  required: boolean;
  currentQty?: number;
  restockResponsibility?: string;
  notes?: string;
}

const EMPTY_ITEM: InventoryItem = {
  name: "",
  category: "bathroom",
  parLevel: 1,
  required: false,
};

function InventoryTab({
  property,
  userId,
}: {
  property: any;
  userId: Id<"users">;
}) {
  const { t } = useTranslation();
  const items: InventoryItem[] = property.inventoryItems ?? [];

  // Mutations
  const addItem = useMutation(api.mutations.properties.addInventoryItem);
  const removeItem = useMutation(api.mutations.properties.removeInventoryItem);
  const updateItems = useMutation(api.mutations.properties.updateInventoryItems);
  const applyTemplate = useMutation(api.mutations.inventoryTemplates.applyToProperty);

  // Templates query
  const templates = useQuery(
    api.queries.inventoryTemplates.list,
    { companyId: property.companyId, userId }
  );

  // UI state
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [templateConfirm, setTemplateConfirm] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleAdd = async (item: InventoryItem) => {
    setSaving(true);
    try {
      await addItem({ userId, propertyId: property._id, item });
      setShowAddForm(false);
      showToast(t("properties.inventory.itemAdded"));
    } catch (e: any) {
      showToast(e.message || "Error");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    setSaving(true);
    try {
      await removeItem({ userId, propertyId: property._id, itemName: removeTarget });
      setRemoveTarget(null);
      showToast(t("properties.inventory.itemRemoved"));
    } catch (e: any) {
      showToast(e.message || "Error");
    } finally {
      setSaving(false);
    }
  };

  const handleEditSave = async (index: number, updated: InventoryItem) => {
    setSaving(true);
    try {
      const newItems = [...items];
      newItems[index] = updated;
      await updateItems({ userId, propertyId: property._id, items: newItems });
      setEditingIndex(null);
      showToast(t("properties.inventory.inventoryUpdated"));
    } catch (e: any) {
      showToast(e.message || "Error");
    } finally {
      setSaving(false);
    }
  };

  const handleApplyTemplate = async () => {
    if (!templateConfirm) return;
    setSaving(true);
    try {
      await applyTemplate({
        userId,
        templateId: templateConfirm as Id<"inventoryTemplates">,
        propertyId: property._id,
      });
      setTemplateConfirm(null);
      showToast(t("properties.inventory.templateApplied"));
    } catch (e: any) {
      showToast(e.message || "Error");
    } finally {
      setSaving(false);
    }
  };

  const selectedTemplate = templates?.find((tmpl) => tmpl._id === templateConfirm);

  // Group items by category for display
  const grouped = items.reduce<Record<string, { item: InventoryItem; index: number }[]>>(
    (acc, item, index) => {
      const cat = item.category || "general";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push({ item, index });
      return acc;
    },
    {}
  );

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium bg-green-600 text-white">
          {toast}
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {templates && templates.length > 0 && (
            <select
              className="input-field text-sm py-1.5 w-auto"
              value=""
              onChange={(e) => {
                if (e.target.value) setTemplateConfirm(e.target.value);
              }}
            >
              <option value="">{t("properties.inventory.applyTemplate")}</option>
              {templates.map((tmpl) => (
                <option key={tmpl._id} value={tmpl._id}>
                  {tmpl.name} ({tmpl.items.length} items)
                </option>
              ))}
            </select>
          )}
        </div>
        <button
          onClick={() => { setShowAddForm(true); setEditingIndex(null); }}
          className="btn-primary flex items-center gap-1.5 text-sm"
        >
          <Plus className="w-4 h-4" /> {t("properties.inventory.addItem")}
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="card">
          <InventoryItemForm
            initial={EMPTY_ITEM}
            onSave={handleAdd}
            onCancel={() => setShowAddForm(false)}
            saving={saving}
          />
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && !showAddForm && (
        <div className="card text-center py-10">
          <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">{t("properties.inventory.noItems")}</p>
          <p className="text-gray-400 text-xs mt-1">{t("properties.inventory.noItemsDesc")}</p>
        </div>
      )}

      {/* Grouped inventory items */}
      {INVENTORY_CATEGORIES.filter((cat) => grouped[cat]?.length).map((cat) => (
        <div key={cat}>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {t(`properties.inventory.categories.${cat}`, INVENTORY_CATEGORY_LABELS[cat])}
          </h3>
          <div className="space-y-2">
            {grouped[cat].map(({ item, index }) =>
              editingIndex === index ? (
                <div key={item.name} className="card">
                  <InventoryItemForm
                    initial={item}
                    onSave={(updated) => handleEditSave(index, updated)}
                    onCancel={() => setEditingIndex(null)}
                    saving={saving}
                  />
                </div>
              ) : (
                <InventoryItemRow
                  key={item.name}
                  item={item}
                  onEdit={() => { setEditingIndex(index); setShowAddForm(false); }}
                  onRemove={() => { setRemoveTarget(item.name); }}
                />
              )
            )}
          </div>
        </div>
      ))}

      {/* Confirm remove dialog */}
      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}
        title={t("properties.inventory.confirmRemove")}
        description={t("properties.inventory.confirmRemoveDesc", { name: removeTarget ?? "" })}
        confirmLabel={t("properties.inventory.removeItem")}
        confirmVariant="danger"
        onConfirm={handleRemove}
        loading={saving}
      />

      {/* Confirm template apply dialog */}
      <ConfirmDialog
        open={templateConfirm !== null}
        onOpenChange={(open) => { if (!open) setTemplateConfirm(null); }}
        title={t("properties.inventory.confirmApplyTemplate")}
        description={t("properties.inventory.confirmApplyTemplateDesc", { name: selectedTemplate?.name ?? "" })}
        confirmLabel={t("properties.inventory.applyTemplate")}
        confirmVariant="primary"
        onConfirm={handleApplyTemplate}
        loading={saving}
      />
    </div>
  );
}

function InventoryItemRow({
  item,
  onEdit,
  onRemove,
}: {
  item: InventoryItem;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="card flex items-center gap-3 py-3 px-4 cursor-pointer hover:bg-gray-50" onClick={onEdit}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-800">{item.name}</span>
          {item.required && (
            <span className="badge bg-red-100 text-red-700 text-[10px]">{t("properties.inventory.required")}</span>
          )}
          {item.restockResponsibility && (
            <span className="badge bg-gray-100 text-gray-600 text-[10px]">
              {t(`properties.inventory.responsibility.${item.restockResponsibility}`, item.restockResponsibility)}
            </span>
          )}
        </div>
        {item.notes && (
          <p className="text-xs text-gray-400 mt-0.5 truncate">{item.notes}</p>
        )}
      </div>
      <div className="flex items-center gap-4 flex-shrink-0">
        <div className="text-right">
          <div className="text-sm font-semibold text-gray-800">
            {item.currentQty != null ? item.currentQty : "—"} / {item.parLevel}
          </div>
          <div className="text-[10px] text-gray-400">{t("properties.inventory.currentQty")} / {t("properties.inventory.parLevel")}</div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function InventoryItemForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: InventoryItem;
  onSave: (item: InventoryItem) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial.name);
  const [category, setCategory] = useState(initial.category);
  const [parLevel, setParLevel] = useState(initial.parLevel);
  const [required, setRequired] = useState(initial.required);
  const [currentQty, setCurrentQty] = useState<number | undefined>(initial.currentQty);
  const [restockResponsibility, setRestockResponsibility] = useState(initial.restockResponsibility ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");

  const handleSubmit = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      category,
      parLevel,
      required,
      ...(currentQty != null ? { currentQty } : {}),
      ...(restockResponsibility ? { restockResponsibility } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600">{t("properties.inventory.itemName")} <span className="text-red-500">*</span></label>
          <input
            className="input-field mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Toilet Paper"
            autoFocus
            disabled={!!initial.name}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">{t("properties.inventory.category")}</label>
          <select className="input-field mt-1" value={category} onChange={(e) => setCategory(e.target.value)}>
            {INVENTORY_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {t(`properties.inventory.categories.${cat}`, INVENTORY_CATEGORY_LABELS[cat])}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600">{t("properties.inventory.parLevel")} <span className="text-red-500">*</span></label>
          <input
            type="number"
            className="input-field mt-1"
            value={parLevel}
            onChange={(e) => setParLevel(Math.max(0, Number(e.target.value)))}
            min={0}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">{t("properties.inventory.currentQty")}</label>
          <input
            type="number"
            className="input-field mt-1"
            value={currentQty ?? ""}
            onChange={(e) => setCurrentQty(e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)))}
            min={0}
            placeholder="—"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">{t("properties.inventory.restockResponsibility")}</label>
          <select className="input-field mt-1" value={restockResponsibility} onChange={(e) => setRestockResponsibility(e.target.value)}>
            <option value="">—</option>
            {RESTOCK_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {t(`properties.inventory.responsibility.${opt}`, opt)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600">{t("properties.inventory.notes")}</label>
        <input
          className="input-field mt-1"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes..."
        />
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          {t("properties.inventory.required")}
        </label>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="btn-secondary text-sm">
          {t("properties.inventory.cancel")}
        </button>
        <button type="submit" disabled={saving || !name.trim()} className="btn-primary text-sm">
          {saving ? "..." : t("properties.inventory.save")}
        </button>
      </div>
    </form>
  );
}

function HistoryTab({
  propertyId,
  history,
}: {
  propertyId: Id<"properties">;
  history: any;
}) {
  const { t } = useTranslation();
  if (history === undefined) return <PageLoader />;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Briefcase className="w-4 h-4 text-gray-400" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {t("properties.totalJobs")}
            </span>
          </div>
          <div className="text-2xl font-semibold text-gray-800">
            {history.totalJobs}
          </div>
        </div>
        <div className="card text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Flag className="w-4 h-4 text-red-400" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {t("properties.totalRedFlags")}
            </span>
          </div>
          <div className="text-2xl font-semibold text-gray-800">
            {history.totalRedFlags}
          </div>
        </div>
        <div className="card text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-orange-400" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {t("properties.openRedFlags")}
            </span>
          </div>
          <div className="text-2xl font-semibold text-orange-600">
            {history.openRedFlags}
          </div>
        </div>
      </div>

      {/* Timeline */}
      {history.timeline.length === 0 ? (
        <div className="card text-center py-8 text-gray-500">
          {t("properties.noHistory")}
        </div>
      ) : (
        <div className="space-y-3">
          {history.timeline.map((item: any, index: number) => (
            <div key={`${item.type}-${item.timestamp}-${index}`}>
              {item.type === "job" ? (
                <JobTimelineItem item={item} />
              ) : (
                <RedFlagTimelineItem item={item} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function JobTimelineItem({ item }: { item: any }) {
  const { t } = useTranslation();
  const data = item.data;
  return (
    <div className="card flex items-start gap-3">
      <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
        <Briefcase className="w-4 h-4 text-blue-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-800">
            {data.title || t("properties.cleaningJob")}
          </span>
          <StatusBadge status={data.status} />
        </div>
        {data.cleanerName && (
          <p className="text-sm text-gray-500 mt-0.5">
            {t("properties.cleaner", { name: data.cleanerName })}
          </p>
        )}
        <p className="text-xs text-gray-400 mt-1">{item.date}</p>
      </div>
    </div>
  );
}

function RedFlagTimelineItem({ item }: { item: any }) {
  const { t } = useTranslation();
  const data = item.data;

  const severityStyles: Record<string, string> = {
    low: "bg-yellow-100 text-yellow-800",
    medium: "bg-orange-100 text-orange-800",
    high: "bg-red-100 text-red-800",
    critical: "bg-red-200 text-red-900",
  };

  return (
    <div className="card flex items-start gap-3 border-l-4 border-l-red-400">
      <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-full bg-red-50 flex items-center justify-center">
        <Flag className="w-4 h-4 text-red-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-800">
            {data.title || t("properties.redFlag")}
          </span>
          <StatusBadge status={data.status} />
          {data.severity && (
            <span
              className={`badge capitalize ${
                severityStyles[data.severity] || "bg-gray-100 text-gray-800"
              }`}
            >
              {data.severity}
            </span>
          )}
        </div>
        {data.description && (
          <p className="text-sm text-gray-600 mt-0.5 line-clamp-2">
            {data.description}
          </p>
        )}
        <p className="text-xs text-gray-400 mt-1">{item.date}</p>
      </div>
    </div>
  );
}
