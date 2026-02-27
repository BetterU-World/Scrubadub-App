import { useState, FormEvent, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader, LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useLocation, useParams } from "wouter";
import { X } from "lucide-react";

const PROPERTY_TYPES = [
  { value: "residential", label: "Residential" },
  { value: "commercial", label: "Commercial" },
  { value: "vacation_rental", label: "Vacation Rental" },
  { value: "office", label: "Office" },
] as const;

export function PropertyFormPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const params = useParams<{ id?: string }>();
  const isEditing = !!params.id;

  const existing = useQuery(
    api.queries.properties.get,
    params.id && user ? { propertyId: params.id as Id<"properties">, userId: user._id } : "skip"
  );

  const createProperty = useMutation(api.mutations.properties.create);
  const updateProperty = useMutation(api.mutations.properties.update);

  const [name, setName] = useState("");
  const [type, setType] = useState<string>("residential");
  const [address, setAddress] = useState("");
  const [accessInstructions, setAccessInstructions] = useState("");
  const [amenities, setAmenities] = useState<string[]>([]);
  const [amenityInput, setAmenityInput] = useState("");
  const [beds, setBeds] = useState<number | undefined>(undefined);
  const [baths, setBaths] = useState<number | undefined>(undefined);
  const [linenCount, setLinenCount] = useState<number | undefined>(undefined);
  const [towelCount, setTowelCount] = useState<number | undefined>(undefined);
  const [sheetSets, setSheetSets] = useState<number | undefined>(undefined);
  const [pillowCount, setPillowCount] = useState<number | undefined>(undefined);
  const [maintenanceNotes, setMaintenanceNotes] = useState("");
  const [ownerNotes, setOwnerNotes] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setType(existing.type);
      setAddress(existing.address);
      setAccessInstructions(existing.accessInstructions ?? "");
      setAmenities(existing.amenities);
      setBeds(existing.beds ?? undefined);
      setBaths(existing.baths ?? undefined);
      setLinenCount(existing.linenCount ?? undefined);
      setTowelCount(existing.towelCount ?? undefined);
      setSheetSets(existing.sheetSets ?? undefined);
      setPillowCount(existing.pillowCount ?? undefined);
      setMaintenanceNotes(existing.maintenanceNotes ?? "");
      setOwnerNotes(existing.ownerNotes ?? "");
    }
  }, [existing]);

  if (isEditing && existing === undefined) return <PageLoader />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user?.companyId) return;
    setError("");
    setLoading(true);
    try {
      const data = {
        name,
        type: type as any,
        address,
        accessInstructions: accessInstructions || undefined,
        amenities,
        beds: beds ?? undefined,
        baths: baths ?? undefined,
        linenCount: linenCount ?? undefined,
        towelCount: towelCount ?? undefined,
        sheetSets: sheetSets ?? undefined,
        pillowCount: pillowCount ?? undefined,
        maintenanceNotes: maintenanceNotes || undefined,
        ownerNotes: ownerNotes || undefined,
      };
      if (isEditing) {
        await updateProperty({ propertyId: params.id as Id<"properties">, userId: user._id, ...data });
        sessionStorage.setItem("scrubadub_toast", "Property updated");
        setLocation(`/properties/${params.id}`);
      } else {
        const id = await createProperty({ companyId: user.companyId, userId: user._id, ...data });
        sessionStorage.setItem("scrubadub_toast", "Property created");
        setLocation(`/properties/${id}`);
      }
    } catch (err: any) {
      setError(err.message || "Failed to save property");
    } finally {
      setLoading(false);
    }
  };

  const addAmenity = () => {
    const trimmed = amenityInput.trim();
    if (trimmed && !amenities.includes(trimmed)) {
      setAmenities([...amenities, trimmed]);
      setAmenityInput("");
    }
  };

  const removeAmenity = (a: string) => {
    setAmenities(amenities.filter((x) => x !== a));
  };

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader title={isEditing ? "Edit Property" : "New Property"} />

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Property Name</label>
          <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Beach House #1" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <select className="input-field" value={type} onChange={(e) => setType(e.target.value)}>
            {PROPERTY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
          <input className="input-field" value={address} onChange={(e) => setAddress(e.target.value)} required placeholder="123 Main St, City, ST 12345" />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Beds</label>
            <input
              type="number"
              min={0}
              className="input-field"
              value={beds ?? ""}
              onChange={(e) => setBeds(e.target.value ? parseInt(e.target.value, 10) : undefined)}
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Baths</label>
            <input
              type="number"
              min={0}
              step="0.5"
              className="input-field"
              value={baths ?? ""}
              onChange={(e) => setBaths(e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Linen Count</label>
            <input
              type="number"
              min={0}
              className="input-field"
              value={linenCount ?? ""}
              onChange={(e) => setLinenCount(e.target.value ? parseInt(e.target.value, 10) : undefined)}
              placeholder="0"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Access Instructions</label>
          <textarea className="input-field" rows={3} value={accessInstructions} onChange={(e) => setAccessInstructions(e.target.value)} placeholder="Lockbox code, key location, etc." />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Amenities</label>
          <div className="flex gap-2 mb-2">
            <input
              className="input-field"
              value={amenityInput}
              onChange={(e) => setAmenityInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAmenity(); } }}
              placeholder="Add amenity (e.g., Pool, Hot Tub)"
            />
            <button type="button" onClick={addAmenity} className="btn-secondary whitespace-nowrap">Add</button>
          </div>
          {amenities.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {amenities.map((a) => (
                <span key={a} className="badge bg-primary-100 text-primary-700 flex items-center gap-1">
                  {a}
                  <button type="button" onClick={() => removeAmenity(a)}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Structured Amenity Counts */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Linen & Supply Counts</label>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Towel Count</label>
              <input
                type="number"
                min={0}
                className="input-field"
                value={towelCount ?? ""}
                onChange={(e) => setTowelCount(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Sheet Sets</label>
              <input
                type="number"
                min={0}
                className="input-field"
                value={sheetSets ?? ""}
                onChange={(e) => setSheetSets(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Pillow Count</label>
              <input
                type="number"
                min={0}
                className="input-field"
                value={pillowCount ?? ""}
                onChange={(e) => setPillowCount(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                placeholder="0"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Maintenance Notes</label>
          <textarea className="input-field" rows={3} value={maintenanceNotes} onChange={(e) => setMaintenanceNotes(e.target.value)} placeholder="Any ongoing maintenance issues or notes" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Owner Notes</label>
          <textarea
            className="input-field"
            rows={3}
            value={ownerNotes}
            onChange={(e) => setOwnerNotes(e.target.value)}
            placeholder="Private notes visible only to the property owner"
          />
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button type="button" onClick={() => setLocation(isEditing ? `/properties/${params.id}` : "/properties")} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2">
            {loading && <LoadingSpinner size="sm" />}
            {isEditing ? "Save Changes" : "Create Property"}
          </button>
        </div>
      </form>
    </div>
  );
}
