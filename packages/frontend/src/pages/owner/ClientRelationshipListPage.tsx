import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { Users, Plus, Save } from "lucide-react";

type ClientType = "residential" | "commercial" | "str" | "property_manager" | "marketplace";
type RelationshipStatus = "active" | "inactive" | "archived";

const CLIENT_TYPES: ClientType[] = [
  "residential",
  "commercial",
  "str",
  "property_manager",
  "marketplace",
];

const STATUSES: RelationshipStatus[] = ["active", "inactive", "archived"];

const EMPTY_FORM = {
  displayName: "",
  clientType: "residential" as ClientType,
  businessName: "",
  primaryContactName: "",
  email: "",
  phone: "",
  status: "active" as RelationshipStatus,
};

function label(value: string) {
  return value.replace(/_/g, " ");
}

export function ClientRelationshipListPage() {
  const { user } = useAuth();
  const relationships = useQuery(
    (api as any).queries.clientRelationships.list,
    user ? { userId: user._id } : "skip"
  );
  const createRelationship = useMutation((api as any).mutations.clientRelationships.create);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  if (!user || relationships === undefined) return <PageLoader />;

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), type === "success" ? 2000 : 3000);
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await createRelationship({
        userId: user._id,
        displayName: form.displayName,
        clientType: form.clientType,
        businessName: form.businessName || undefined,
        primaryContactName: form.primaryContactName || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        status: form.status,
      });
      setForm(EMPTY_FORM);
      setShowCreate(false);
      showToast("Client relationship created", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to create client relationship", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Company-scoped client relationships for leads, properties, and service accounts."
        action={
          <button
            type="button"
            onClick={() => setShowCreate((current) => !current)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            New Client
          </button>
        }
      />

      {showCreate && (
        <form onSubmit={handleCreate} className="card mb-6 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Display name</span>
              <input
                className="input-field mt-1"
                value={form.displayName}
                onChange={(event) => setForm({ ...form, displayName: event.target.value })}
                required
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Client type</span>
              <select
                className="input-field mt-1 capitalize"
                value={form.clientType}
                onChange={(event) => setForm({ ...form, clientType: event.target.value as ClientType })}
              >
                {CLIENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {label(type)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Business name</span>
              <input
                className="input-field mt-1"
                value={form.businessName}
                onChange={(event) => setForm({ ...form, businessName: event.target.value })}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Primary contact</span>
              <input
                className="input-field mt-1"
                value={form.primaryContactName}
                onChange={(event) => setForm({ ...form, primaryContactName: event.target.value })}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Email</span>
              <input
                type="email"
                className="input-field mt-1"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Phone</span>
              <input
                className="input-field mt-1"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Status</span>
              <select
                className="input-field mt-1 capitalize"
                value={form.status}
                onChange={(event) => setForm({ ...form, status: event.target.value as RelationshipStatus })}
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save Client"}
            </button>
          </div>
        </form>
      )}

      {relationships.length === 0 ? (
        <div className="card py-12 text-center">
          <Users className="mx-auto h-10 w-10 text-gray-300" />
          <h2 className="mt-3 text-lg font-semibold text-gray-900">No clients yet</h2>
          <p className="mt-1 text-sm text-gray-500">
            Create one here, or create one from an existing lead.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {relationships.map((relationship: any) => (
            <div key={relationship._id} className="card">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-gray-900">{relationship.displayName}</h2>
                    <span className="badge bg-gray-100 text-gray-700 capitalize">
                      {label(relationship.clientType)}
                    </span>
                    <span className="badge bg-primary-50 text-primary-700 capitalize">
                      {relationship.status}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-1 text-sm text-gray-500 sm:grid-cols-2">
                    {relationship.businessName && <span>{relationship.businessName}</span>}
                    {relationship.primaryContactName && <span>{relationship.primaryContactName}</span>}
                    {relationship.email && <span>{relationship.email}</span>}
                    {relationship.phone && <span>{relationship.phone}</span>}
                  </div>
                </div>
                <div className="text-xs text-gray-400">
                  Updated {new Date(relationship.updatedAt).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {toast && (
        <div className={`fixed right-4 top-4 z-50 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${toast.type === "success" ? "bg-green-600" : "bg-red-600"}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
