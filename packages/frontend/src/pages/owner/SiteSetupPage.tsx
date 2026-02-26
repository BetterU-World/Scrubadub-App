import { useState, useEffect, useRef, FormEvent } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader, LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Plus, X } from "lucide-react";
import { ShareKit } from "@/components/owner/ShareKit";

export function SiteSetupPage() {
  const { user } = useAuth();

  const site = useQuery(
    api.queries.companySites.getMySite,
    user?.companyId ? { companyId: user.companyId, userId: user._id } : "skip"
  );

  const upsert = useMutation(api.mutations.companySites.upsertSite);
  const ensureToken = useMutation(
    api.mutations.companySites.ensurePublicRequestToken
  );

  // Auto-generate booking token when site exists but token is missing
  const tokenEnsured = useRef(false);
  const [tokenError, setTokenError] = useState("");
  useEffect(() => {
    if (!user || !site || site.publicRequestToken || tokenEnsured.current)
      return;
    tokenEnsured.current = true;
    ensureToken({ userId: user._id, companyId: user.companyId }).catch(
      (err: any) => {
        tokenEnsured.current = false; // allow retry
        setTokenError(err.message || "Failed to generate booking link");
      }
    );
  }, [user, site]);

  // Form state
  const [slug, setSlug] = useState("");
  const [templateId, setTemplateId] = useState<"A" | "B">("A");
  const [brandName, setBrandName] = useState("");
  const [bio, setBio] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [services, setServices] = useState<string[]>([]);
  const [publicEmail, setPublicEmail] = useState("");
  const [publicPhone, setPublicPhone] = useState("");
  const [metaDescription, setMetaDescription] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  // Seed form when site data loads
  useEffect(() => {
    if (site) {
      setSlug(site.slug);
      setTemplateId(site.templateId);
      setBrandName(site.brandName);
      setBio(site.bio);
      setServiceArea(site.serviceArea);
      setLogoUrl(site.logoUrl ?? "");
      setHeroImageUrl(site.heroImageUrl ?? "");
      setServices(site.services ?? []);
      setPublicEmail(site.publicEmail ?? "");
      setPublicPhone(site.publicPhone ?? "");
      setMetaDescription(site.metaDescription ?? "");
    }
  }, [site]);

  if (!user || site === undefined) return <PageLoader />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    setSaved(false);
    try {
      await upsert({
        userId: user._id,
        companyId: user.companyId,
        slug: slug.trim().toLowerCase(),
        templateId,
        brandName: brandName.trim(),
        bio: bio.trim(),
        serviceArea: serviceArea.trim(),
        logoUrl: logoUrl.trim() || undefined,
        heroImageUrl: heroImageUrl.trim() || undefined,
        services: services.filter((s) => s.trim().length > 0),
        publicEmail: publicEmail.trim() || undefined,
        publicPhone: publicPhone.trim() || undefined,
        metaDescription: metaDescription.trim() || undefined,
      });
      setSaved(true);
    } catch (err: any) {
      setError(err.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const addService = () => {
    if (services.length < 8) {
      setServices([...services, ""]);
      setSaved(false);
    }
  };

  const updateService = (index: number, value: string) => {
    const next = [...services];
    next[index] = value.slice(0, 60);
    setServices(next);
    setSaved(false);
  };

  const removeService = (index: number) => {
    setServices(services.filter((_, i) => i !== index));
    setSaved(false);
  };

  return (
    <div>
      <PageHeader
        title="My Site"
        description="Set up your public mini-site so clients can find you"
      />

      {site && !site.bio && !site.serviceArea && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
          Your website is live &mdash; add details to improve it.
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {saved && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          Site saved successfully.
        </div>
      )}

      {tokenError && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm flex items-center justify-between">
          <span>{tokenError}</span>
          <button
            type="button"
            onClick={() => {
              setTokenError("");
              tokenEnsured.current = false;
              ensureToken({
                userId: user._id,
                companyId: user.companyId,
              }).catch((err: any) => {
                tokenEnsured.current = false;
                setTokenError(
                  err.message || "Failed to generate booking link"
                );
              });
            }}
            className="text-yellow-800 underline hover:text-yellow-900 ml-3 whitespace-nowrap"
          >
            Retry
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-5">
        {/* Slug */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Slug (URL path)
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">
              {window.location.origin}/
            </span>
            <input
              className="input-field flex-1"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                setSaved(false);
              }}
              required
              placeholder="my-cleaning-co"
              pattern="[a-z0-9][a-z0-9-]{1,48}[a-z0-9]"
              title="3-50 chars, lowercase letters, numbers, hyphens"
            />
          </div>
        </div>

        {/* Template */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Template
          </label>
          <div className="flex gap-3">
            {(["A", "B"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setTemplateId(t); setSaved(false); }}
                className={
                  templateId === t
                    ? "flex-1 p-4 border-2 border-primary-500 rounded-lg bg-primary-50 text-center"
                    : "flex-1 p-4 border-2 border-gray-200 rounded-lg hover:border-gray-300 text-center"
                }
              >
                <div className="text-sm font-semibold text-gray-900">
                  Template {t}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {t === "A" ? "Clean & minimal" : "Bold with hero image"}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Brand name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Brand name
          </label>
          <input
            className="input-field"
            value={brandName}
            onChange={(e) => { setBrandName(e.target.value); setSaved(false); }}
            required
            placeholder="Sparkling Clean Co."
          />
        </div>

        {/* Bio */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Bio
          </label>
          <textarea
            className="input-field"
            rows={3}
            value={bio}
            onChange={(e) => { setBio(e.target.value); setSaved(false); }}
            required
            placeholder="Tell potential clients about your business..."
          />
        </div>

        {/* Service area */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Service area
          </label>
          <input
            className="input-field"
            value={serviceArea}
            onChange={(e) => { setServiceArea(e.target.value); setSaved(false); }}
            required
            placeholder="Austin, TX metro area"
          />
        </div>

        {/* Services list */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Services{" "}
            <span className="font-normal text-gray-400">
              (optional, up to 8)
            </span>
          </label>
          <div className="space-y-2">
            {services.map((svc, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className="input-field flex-1"
                  value={svc}
                  onChange={(e) => updateService(i, e.target.value)}
                  placeholder={`Service ${i + 1}`}
                  maxLength={60}
                />
                <button
                  type="button"
                  onClick={() => removeService(i)}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          {services.length < 8 && (
            <button
              type="button"
              onClick={addService}
              className="mt-2 text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              Add service
            </button>
          )}
        </div>

        {/* Public contact */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-medium text-gray-700">
            Public contact info{" "}
            <span className="font-normal text-gray-400">(optional)</span>
          </legend>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              className="input-field"
              value={publicEmail}
              onChange={(e) => { setPublicEmail(e.target.value); setSaved(false); }}
              placeholder="hello@cleaningco.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone
            </label>
            <input
              type="tel"
              className="input-field"
              value={publicPhone}
              onChange={(e) => { setPublicPhone(e.target.value); setSaved(false); }}
              placeholder="(555) 123-4567"
            />
          </div>
        </fieldset>

        {/* Logo URL */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Logo URL{" "}
            <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            type="url"
            className="input-field"
            value={logoUrl}
            onChange={(e) => { setLogoUrl(e.target.value); setSaved(false); }}
            placeholder="https://example.com/logo.png"
          />
        </div>

        {/* Hero image URL */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Hero image URL{" "}
            <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            type="url"
            className="input-field"
            value={heroImageUrl}
            onChange={(e) => { setHeroImageUrl(e.target.value); setSaved(false); }}
            placeholder="https://example.com/hero.jpg"
          />
        </div>

        {/* Meta description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Meta description{" "}
            <span className="font-normal text-gray-400">(optional, SEO)</span>
          </label>
          <textarea
            className="input-field"
            rows={2}
            value={metaDescription}
            onChange={(e) => {
              setMetaDescription(e.target.value.slice(0, 160));
              setSaved(false);
            }}
            placeholder="Short description for search engines..."
            maxLength={160}
          />
          <p className="text-xs text-gray-400 mt-1">
            {metaDescription.length}/160
          </p>
        </div>

        {/* Submit */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={saving}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {saving && <LoadingSpinner size="sm" />}
            {site ? "Save changes" : "Create site"}
          </button>
        </div>
      </form>

      {/* Share Kit */}
      {site && (
        <ShareKit
          slug={site.slug}
          publicRequestToken={site.publicRequestToken}
          brandName={site.brandName}
        />
      )}
    </div>
  );
}
