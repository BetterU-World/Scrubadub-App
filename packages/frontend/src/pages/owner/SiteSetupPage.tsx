import { useState, useEffect, useRef, FormEvent } from "react";
import { useQuery, useMutation } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader, LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ExternalLink, Globe2, Plus, X } from "lucide-react";
import { ShareKit } from "@/components/owner/ShareKit";

export function SiteSetupPage() {
  const { t } = useTranslation();
  const { user, sessionToken } = useAuth();

  const site = useQuery(
    api.queries.companySites.getMySite,
    user?.companyId && sessionToken ? { companyId: user.companyId, userId: user._id, sessionToken } : "skip"
  );

  const upsert = useMutation(api.mutations.companySites.upsertSite);
  const ensureToken = useMutation(
    api.mutations.companySites.ensurePublicRequestToken
  );

  // Auto-generate booking token when site exists but token is missing
  const tokenEnsured = useRef(false);
  const [tokenError, setTokenError] = useState("");
  useEffect(() => {
    if (!user?.companyId || !site || site.publicRequestToken || tokenEnsured.current)
      return;
    tokenEnsured.current = true;
    ensureToken({ userId: user._id, sessionToken, companyId: user.companyId }).catch(
      (err: any) => {
        tokenEnsured.current = false; // allow retry
        setTokenError(err.message || t("siteBuilder.failedToGenerateLink"));
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
    if (!user.companyId) return;
    setError("");
    setSaving(true);
    setSaved(false);
    try {
      await upsert({
        userId: user._id,
        sessionToken,
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
        title={t("siteBuilder.title")}
        description={t("guidance.owner.siteSetup")}
      />

      {site && (
        <section className="card mb-6 overflow-hidden border-primary-100 bg-primary-50/40" aria-labelledby="site-overview-title">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-700">
                <Globe2 className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">{t("siteBuilder.siteLiveHint")}</p>
                <h2 id="site-overview-title" className="mt-1 break-words text-lg font-semibold text-gray-900">{site.brandName}</h2>
                <p className="mt-1 break-all text-sm text-gray-600">{window.location.origin}/{site.slug}</p>
              </div>
            </div>
            <a href={`/${site.slug}`} target="_blank" rel="noopener noreferrer" className="btn-primary touch-target inline-flex w-full items-center justify-center gap-2 sm:w-auto">
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {t("common.open")}
            </a>
          </div>
        </section>
      )}

      {site && !site.bio && !site.serviceArea && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
          {t("siteBuilder.siteLiveHint")}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {saved && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {t("siteBuilder.siteSaved")}
        </div>
      )}

      {tokenError && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>{tokenError}</span>
          <button
            type="button"
            onClick={() => {
              setTokenError("");
              tokenEnsured.current = false;
              if (!user.companyId) return;
              ensureToken({
                userId: user._id,
                sessionToken,
                companyId: user.companyId,
              }).catch((err: any) => {
                tokenEnsured.current = false;
                setTokenError(
                  err.message || t("siteBuilder.failedToGenerateLink")
                );
              });
            }}
            className="touch-target text-yellow-800 underline hover:text-yellow-900 sm:ml-3 whitespace-nowrap"
          >
            {t("siteBuilder.retry")}
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-5">
        {/* Slug */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("siteBuilder.slug")}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="break-all text-sm text-gray-400">
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
              title={t("siteBuilder.slugHint")}
            />
          </div>
        </div>

        {/* Template */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("siteBuilder.template")}
          </label>
          <div className="flex gap-3">
            {(["A", "B"] as const).map((tpl) => (
              <button
                key={tpl}
                type="button"
                onClick={() => { setTemplateId(tpl); setSaved(false); }}
                className={
                  templateId === tpl
                    ? "flex-1 p-4 border-2 border-primary-500 rounded-lg bg-primary-50 text-center"
                    : "flex-1 p-4 border-2 border-gray-200 rounded-lg hover:border-gray-300 text-center"
                }
              >
                <div className="text-sm font-semibold text-gray-900">
                  {t(tpl === "A" ? "siteBuilder.templateA" : "siteBuilder.templateB")}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {t(tpl === "A" ? "siteBuilder.templateADesc" : "siteBuilder.templateBDesc")}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Brand name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("siteBuilder.brandName")}
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
            {t("siteBuilder.bio")}
          </label>
          <textarea
            className="input-field"
            rows={3}
            value={bio}
            onChange={(e) => { setBio(e.target.value); setSaved(false); }}
            required
            placeholder={t("siteBuilder.bioPlaceholder")}
          />
        </div>

        {/* Service area */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("siteBuilder.serviceArea")}
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
            {t("siteBuilder.services")}{" "}
            <span className="font-normal text-gray-400">
              ({t("siteBuilder.servicesHint")})
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
                  className="touch-target flex shrink-0 items-center justify-center text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-100"
                  aria-label={`${t("common.delete")} ${svc || i + 1}`}
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
              className="touch-target mt-2 text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              {t("siteBuilder.addService")}
            </button>
          )}
        </div>

        {/* Public contact */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-medium text-gray-700">
            {t("siteBuilder.publicContact")}{" "}
            <span className="font-normal text-gray-400">({t("siteBuilder.optional")})</span>
          </legend>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("siteBuilder.email")}
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
              {t("siteBuilder.phone")}
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
            {t("siteBuilder.logoUrl")}{" "}
            <span className="font-normal text-gray-400">({t("siteBuilder.optional")})</span>
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
            {t("siteBuilder.heroImageUrl")}{" "}
            <span className="font-normal text-gray-400">({t("siteBuilder.optional")})</span>
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
            {t("siteBuilder.metaDescription")}{" "}
            <span className="font-normal text-gray-400">({t("siteBuilder.metaSeo")})</span>
          </label>
          <textarea
            className="input-field"
            rows={2}
            value={metaDescription}
            onChange={(e) => {
              setMetaDescription(e.target.value.slice(0, 160));
              setSaved(false);
            }}
            placeholder={t("siteBuilder.metaPlaceholder")}
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
            className="btn-primary touch-target w-full flex items-center justify-center gap-2"
          >
            {saving && <LoadingSpinner size="sm" />}
            {site ? t("siteBuilder.saveChanges") : t("siteBuilder.createSite")}
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
