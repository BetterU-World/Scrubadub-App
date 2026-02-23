import { useState, useEffect, FormEvent } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader, LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Copy, ExternalLink, Check } from "lucide-react";

export function SiteSetupPage() {
  const { user } = useAuth();

  const site = useQuery(
    api.queries.companySites.getMySite,
    user?.companyId ? { companyId: user.companyId, userId: user._id } : "skip"
  );

  const upsert = useMutation(api.mutations.companySites.upsertSite);

  // Form state
  const [slug, setSlug] = useState("");
  const [templateId, setTemplateId] = useState<"A" | "B">("A");
  const [brandName, setBrandName] = useState("");
  const [bio, setBio] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

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
    }
  }, [site]);

  if (!user || site === undefined) return <PageLoader />;

  const siteUrl = `${window.location.origin}/${slug || "your-slug"}`;

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
      });
      setSaved(true);
    } catch (err: any) {
      setError(err.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(siteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <PageHeader
        title="My Site"
        description="Set up your public mini-site so clients can find you"
      />

      {/* Preview link */}
      {site && (
        <div className="card mb-6 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-700 mb-1">
              Your public site
            </p>
            <p className="text-sm text-primary-600 truncate">{siteUrl}</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="btn-secondary flex items-center gap-1.5 text-sm"
            >
              {copied ? (
                <Check className="w-4 h-4" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
            <a
              href={`/${site.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary flex items-center gap-1.5 text-sm"
            >
              <ExternalLink className="w-4 h-4" />
              Preview
            </a>
          </div>
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
              title="3–50 chars, lowercase letters, numbers, hyphens"
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
    </div>
  );
}
