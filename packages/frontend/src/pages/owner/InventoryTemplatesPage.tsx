import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useTranslation } from "react-i18next";
import {
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_LABELS,
} from "../../../../../convex/lib/constants";
import {
  ClipboardList,
  Plus,
  Trash2,
  Star,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";

const RESTOCK_OPTIONS = ["owner", "cleaner", "manager"] as const;

interface TemplateItem {
  name: string;
  category: string;
  parLevel: number;
  required: boolean;
  restockResponsibility?: string;
  notes?: string;
}

const EMPTY_ITEM: TemplateItem = {
  name: "",
  category: "bathroom",
  parLevel: 1,
  required: false,
};

export function InventoryTemplatesPage() {
  const { user } = useAuth();
  const { t } = useTranslation();

  const templates = useQuery(
    api.queries.inventoryTemplates.list,
    user?.companyId ? { companyId: user.companyId, userId: user._id } : "skip"
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  if (!user || templates === undefined) return <PageLoader />;

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title={t("inventoryTemplates.title")}
        description={t("inventoryTemplates.description")}
        action={
          <button
            onClick={() => { setCreating(true); setEditingId(null); }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> {t("inventoryTemplates.createTemplate")}
          </button>
        }
      />

      {creating && (
        <div className="mb-6">
          <TemplateEditor
            companyId={user.companyId!}
            userId={user._id}
            onDone={() => setCreating(false)}
          />
        </div>
      )}

      {templates.length === 0 && !creating ? (
        <EmptyState
          icon={ClipboardList}
          title={t("inventoryTemplates.noTemplates")}
          description={t("inventoryTemplates.noTemplatesDesc")}
          action={
            <button onClick={() => setCreating(true)} className="btn-primary">
              {t("inventoryTemplates.createTemplate")}
            </button>
          }
        />
      ) : (
        <div className="space-y-4">
          {templates.map((tmpl) =>
            editingId === tmpl._id ? (
              <TemplateEditor
                key={tmpl._id}
                companyId={user.companyId!}
                userId={user._id}
                template={tmpl}
                onDone={() => { setEditingId(null); }}
              />
            ) : (
              <TemplateCard
                key={tmpl._id}
                template={tmpl}
                userId={user._id}
                onEdit={() => { setEditingId(tmpl._id); setCreating(false); }}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

// ── Template Card (read-only view) ─────────────────────────────────────

function TemplateCard({
  template,
  userId,
  onEdit,
}: {
  template: any;
  userId: Id<"users">;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const removeMutation = useMutation(api.mutations.inventoryTemplates.remove);
  const updateMutation = useMutation(api.mutations.inventoryTemplates.update);
  const [togglingDefault, setTogglingDefault] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await removeMutation({ userId, templateId: template._id });
      setDeleteOpen(false);
    } catch {
      // error handled by convex
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleDefault = async () => {
    setTogglingDefault(true);
    try {
      await updateMutation({
        userId,
        templateId: template._id,
        isDefault: !template.isDefault,
      });
    } catch {
      // error handled by convex
    } finally {
      setTogglingDefault(false);
    }
  };

  // Group items by category
  const grouped: Record<string, TemplateItem[]> = {};
  for (const item of template.items) {
    const cat = item.category || "general";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{template.name}</h3>
          {template.isDefault && (
            <span className="badge bg-yellow-100 text-yellow-700 flex items-center gap-1">
              <Star className="w-3 h-3" /> {t("inventoryTemplates.default")}
            </span>
          )}
          <span className="text-xs text-gray-400">
            {t("inventoryTemplates.items", { count: template.items.length })}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={handleToggleDefault}
            disabled={togglingDefault}
            className="p-1.5 text-gray-400 hover:text-yellow-500 rounded transition-colors"
            title={t("inventoryTemplates.setDefault")}
          >
            <Star className={`w-4 h-4 ${template.isDefault ? "fill-yellow-400 text-yellow-500" : ""}`} />
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button
            onClick={onEdit}
            className="btn-secondary text-xs py-1 px-2.5"
          >
            {t("inventoryTemplates.editTemplate")}
          </button>
          <button
            onClick={() => setDeleteOpen(true)}
            className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-3">
          {INVENTORY_CATEGORIES.filter((cat) => grouped[cat]?.length).map((cat) => (
            <div key={cat}>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                {t(`properties.inventory.categories.${cat}`, INVENTORY_CATEGORY_LABELS[cat])}
              </h4>
              <div className="space-y-1">
                {grouped[cat].map((item) => (
                  <div key={item.name} className="flex items-center justify-between py-1.5 px-2 rounded bg-gray-50 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-800">{item.name}</span>
                      {item.required && (
                        <span className="badge bg-red-100 text-red-700 text-[10px]">
                          {t("properties.inventory.required")}
                        </span>
                      )}
                    </div>
                    <span className="text-gray-500 text-xs">
                      {t("properties.inventory.parLevel")}: {item.parLevel}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t("inventoryTemplates.confirmDelete")}
        description={t("inventoryTemplates.confirmDeleteDesc", { name: template.name })}
        confirmLabel={t("inventoryTemplates.deleteTemplate")}
        confirmVariant="danger"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}

// ── Template Editor (create / edit) ────────────────────────────────────

function TemplateEditor({
  companyId,
  userId,
  template,
  onDone,
}: {
  companyId: Id<"companies">;
  userId: Id<"users">;
  template?: any;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const createMutation = useMutation(api.mutations.inventoryTemplates.create);
  const updateMutation = useMutation(api.mutations.inventoryTemplates.update);

  const [name, setName] = useState(template?.name ?? "");
  const [isDefault, setIsDefault] = useState(template?.isDefault ?? false);
  const [items, setItems] = useState<TemplateItem[]>(
    template?.items ?? [{ ...EMPTY_ITEM }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addItem = () => {
    setItems([...items, { ...EMPTY_ITEM }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: string, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) {
      setError(t("inventoryTemplates.nameRequired"));
      return;
    }
    const validItems = items.filter((i) => i.name.trim());
    if (validItems.length === 0) {
      setError(t("inventoryTemplates.atLeastOneItem"));
      return;
    }

    // Clean up items
    const cleanItems = validItems.map((i) => ({
      name: i.name.trim(),
      category: i.category,
      parLevel: i.parLevel,
      required: i.required,
      ...(i.restockResponsibility ? { restockResponsibility: i.restockResponsibility } : {}),
      ...(i.notes?.trim() ? { notes: i.notes.trim() } : {}),
    }));

    setSaving(true);
    try {
      if (template) {
        await updateMutation({
          userId,
          templateId: template._id,
          name: name.trim(),
          items: cleanItems,
          isDefault,
        });
      } else {
        await createMutation({
          userId,
          companyId,
          name: name.trim(),
          items: cleanItems,
          isDefault,
        });
      }
      onDone();
    } catch (e: any) {
      setError(e.message || "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">
          {template ? t("inventoryTemplates.editTemplate") : t("inventoryTemplates.createTemplate")}
        </h3>
        <button onClick={onDone} className="p-1 text-gray-400 hover:text-gray-600 rounded">
          <X className="w-5 h-5" />
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
      )}

      {/* Template name + default toggle */}
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="text-xs font-medium text-gray-600">
            {t("inventoryTemplates.templateName")} <span className="text-red-500">*</span>
          </label>
          <input
            className="input-field mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("inventoryTemplates.templateNamePlaceholder")}
            autoFocus
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer pb-2">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          {t("inventoryTemplates.setDefault")}
        </label>
      </div>

      {/* Items list */}
      <div className="space-y-2">
        {items.map((item, index) => (
          <TemplateItemRow
            key={index}
            item={item}
            index={index}
            onChange={updateItem}
            onRemove={() => removeItem(index)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={addItem}
        className="btn-secondary text-sm flex items-center gap-1.5 w-full justify-center"
      >
        <Plus className="w-4 h-4" /> {t("inventoryTemplates.addItem")}
      </button>

      {/* Save / Cancel */}
      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <button onClick={onDone} className="btn-secondary text-sm">
          {t("common.cancel")}
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary text-sm"
        >
          {saving ? t("inventoryTemplates.saving") : t("inventoryTemplates.save")}
        </button>
      </div>
    </div>
  );
}

// ── Single Item Row inside the editor ──────────────────────────────────

function TemplateItemRow({
  item,
  index,
  onChange,
  onRemove,
}: {
  item: TemplateItem;
  index: number;
  onChange: (index: number, field: string, value: any) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2">
        <input
          className="input-field flex-1 text-sm"
          value={item.name}
          onChange={(e) => onChange(index, "name", e.target.value)}
          placeholder={t("properties.inventory.itemName")}
        />
        <select
          className="input-field text-sm w-auto"
          value={item.category}
          onChange={(e) => onChange(index, "category", e.target.value)}
        >
          {INVENTORY_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {t(`properties.inventory.categories.${cat}`, INVENTORY_CATEGORY_LABELS[cat])}
            </option>
          ))}
        </select>
        <button
          onClick={onRemove}
          className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors flex-shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500">{t("properties.inventory.parLevel")}</label>
          <input
            type="number"
            className="input-field text-sm w-16 py-1"
            value={item.parLevel}
            onChange={(e) => onChange(index, "parLevel", Math.max(0, Number(e.target.value)))}
            min={0}
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={item.required}
            onChange={(e) => onChange(index, "required", e.target.checked)}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          {t("properties.inventory.required")}
        </label>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500">{t("properties.inventory.restockResponsibility")}</label>
          <select
            className="input-field text-sm w-auto py-1"
            value={item.restockResponsibility ?? ""}
            onChange={(e) => onChange(index, "restockResponsibility", e.target.value || undefined)}
          >
            <option value="">—</option>
            {RESTOCK_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {t(`properties.inventory.responsibility.${opt}`, opt)}
              </option>
            ))}
          </select>
        </div>
        <input
          className="input-field text-sm flex-1 py-1 min-w-[120px]"
          value={item.notes ?? ""}
          onChange={(e) => onChange(index, "notes", e.target.value || undefined)}
          placeholder={t("properties.inventory.notes")}
        />
      </div>
    </div>
  );
}
