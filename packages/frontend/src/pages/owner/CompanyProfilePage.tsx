import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";

export function CompanyProfilePage() {
  const { user } = useAuth();

  const profile = useQuery(
    api.queries.companies.getCompanyProfile,
    user?._id ? { userId: user._id } : "skip",
  );

  const updateProfile = useMutation(
    api.mutations.companies.updateCompanyProfile,
  );

  const [displayName, setDisplayName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [serviceArea, setServiceArea] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  // Seed form when profile loads
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.companyDisplayName ?? profile.name ?? "");
      setContactEmail(profile.contactEmail ?? "");
      setContactPhone(profile.contactPhone ?? "");
      setServiceArea(profile.serviceAreaText ?? "");
    }
  }, [profile]);

  if (!user || profile === undefined) return <PageLoader />;

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await updateProfile({
        userId: user._id,
        companyDisplayName: displayName.trim(),
        contactEmail: contactEmail.trim(),
        contactPhone: contactPhone.trim(),
        serviceAreaText: serviceArea.trim(),
      });
      setToast("Profile saved");
      setTimeout(() => setToast(null), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Company Profile"
        description="These defaults feed your microsites when site-level fields are empty."
      />

      <div className="max-w-lg space-y-5">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Display name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Company display name
          </label>
          <input
            type="text"
            className="input"
            placeholder={profile?.name ?? ""}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <p className="mt-1 text-xs text-gray-400">
            Shown on microsites if no brand name is set.
          </p>
        </div>

        {/* Contact email */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Contact email
          </label>
          <input
            type="email"
            className="input"
            placeholder="info@example.com"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
          />
        </div>

        {/* Contact phone */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Contact phone
          </label>
          <input
            type="tel"
            className="input"
            placeholder="(555) 123-4567"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
          />
        </div>

        {/* Service area */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Service area
          </label>
          <textarea
            className="input min-h-[80px]"
            placeholder="e.g. Austin, TX and surrounding areas"
            value={serviceArea}
            onChange={(e) => setServiceArea(e.target.value)}
          />
          <p className="mt-1 text-xs text-gray-400">
            Falls back to this if your microsite has no service area set.
          </p>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium bg-green-600 text-white">
          {toast}
        </div>
      )}
    </div>
  );
}
