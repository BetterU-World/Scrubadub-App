import { useState, useEffect, useRef, FormEvent } from "react";
import { useQuery, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader, LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ExternalLink, Eye, Globe2, Plus, X } from "lucide-react";
import { ShareKit } from "@/components/owner/ShareKit";
import { DialogShell } from "@/components/ui/DialogShell";
import { MiniSiteContent } from "@/pages/public/PublicSitePage";
import { isMiniSitePublished, MAX_ADDITIONAL_AREAS, normalizedAdditionalAreas } from "../../../../../convex/lib/miniSiteSeo";
import { publicMiniSiteSections, resolveMiniSiteSections } from "../../../../../convex/lib/miniSiteSections";
import { MiniSiteSectionEditor } from "./MiniSiteSectionEditor";
import { BusinessHoursFields, ProfileFields, QuoteFields } from "./MiniSitePresentationFields";
import { publicMiniSitePresentation, SITE_CONTENT_LIMITS, type MiniSitePresentation } from "../../../../../convex/lib/miniSitePresentation";
import { EMPTY_MEDIA, projectMicrositeMedia, type MediaConfig } from "../../../../../convex/lib/micrositeMediaModel";
import { GalleryFields, TeamFields } from "./MicrositeMediaFields";
import { MicrositeResourceFields } from "./MicrositeResourceFields";
import type { ResourceEntry } from "../../../../../convex/lib/micrositeResourcesModel";
import { useMicrositeImages } from "./useMicrositeImages";

type ServiceDraft = Pick<NonNullable<MiniSitePresentation["serviceDetails"]>[number], "name" | "description" | "included" | "excluded">;
type PresentationDraft = Omit<MiniSitePresentation, "serviceDetails">;

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
  const [additionalServiceAreas, setAdditionalServiceAreas] = useState<string[]>([]);
  const [isPublished, setIsPublished] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [services, setServices] = useState<ServiceDraft[]>([]);
  const [presentation, setPresentation] = useState<PresentationDraft>({});
  const [publicEmail, setPublicEmail] = useState("");
  const [publicPhone, setPublicPhone] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [sections, setSections] = useState(() => resolveMiniSiteSections([]));
  const [previewOpen, setPreviewOpen] = useState(false);
  const [media, setMedia] = useState<MediaConfig>(EMPTY_MEDIA);
  const [resourceEntries, setResourceEntries] = useState<ResourceEntry[]>([]);
  const [resourcePanel, setResourcePanel] = useState(false);
  const [mediaPanel, setMediaPanel] = useState<"gallery" | "team" | false>(false);
  const images = useMicrositeImages(sessionToken, media, previewOpen ? "all" : mediaPanel);
  const documentRows = useQuery(api.micrositeResources.list,
    sessionToken && (resourcePanel || previewOpen)
      ? { sessionToken, selected: resourceEntries.map(({ resourceId }) => resourceId) }
      : "skip");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const markDirty = () => {
    setDirty(true);
    setSaved(false);
  };
  const updatePresentation = (changes: Partial<PresentationDraft>) => {
    setPresentation((current) => ({ ...current, ...changes }));
    markDirty();
  };

  const previewContent = useQuery(
    api.queries.companySites.getPreviewContent,
    previewOpen && sessionToken && user ? {
      userId: user._id,
      sessionToken,
      includeAddOns: sections.some(({ id, enabled }) => id === "addOns" && enabled),
      includeReviews: sections.some(({ id, enabled }) => id === "reviews" && enabled),
    } : "skip",
  );

  // Seed form when site data loads
  useEffect(() => {
    if (site && !dirty) {
      setSlug(site.slug);
      setTemplateId(site.templateId);
      setBrandName(site.brandName);
      setBio(site.bio);
      setServiceArea(site.serviceArea);
      setAdditionalServiceAreas(site.additionalServiceAreas ?? []);
      setIsPublished(isMiniSitePublished(site));
      setLogoUrl(site.logoUrl ?? "");
      setHeroImageUrl(site.heroImageUrl ?? "");
      const { serviceDetails, ...savedPresentation } = site.presentation ?? {};
      setServices((site.services ?? []).map((name, index) => {
        const details = serviceDetails?.find((item) => item.index === index && item.name === name);
        return { name, description: details?.description, included: details?.included, excluded: details?.excluded };
      }));
      setPresentation(savedPresentation);
      setPublicEmail(site.publicEmail ?? "");
      setPublicPhone(site.publicPhone ?? "");
      setMetaDescription(site.metaDescription ?? "");
      setSections(resolveMiniSiteSections(site.sections));
      setMedia(site.media ?? EMPTY_MEDIA);
      setResourceEntries(site.resources ?? []);
    }
  }, [site, dirty]);

  if (!user || site === undefined) return <PageLoader />;
  const sitePublished = site ? isMiniSitePublished(site) : false;
  const configuredServices = services.filter(({ name }) => name.trim()).slice(0, SITE_CONTENT_LIMITS.services)
    .map((service) => ({ ...service, name: service.name.trim().slice(0, SITE_CONTENT_LIMITS.serviceName).trimEnd() }));
  const serviceNames = configuredServices.map(({ name }) => name);
  const currentPresentation = {
    ...presentation,
    serviceDetails: configuredServices.map((service, index) => ({ ...service, index }))
      .filter(({ description, included, excluded }) => description?.trim() || included?.trim() || excluded?.trim()),
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user.companyId || saving || images.blocked) return;
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
        additionalServiceAreas: additionalServiceAreas.filter(Boolean),
        isPublished,
        logoUrl: logoUrl.trim() || undefined,
        heroImageUrl: heroImageUrl.trim() || undefined,
        services: serviceNames,
        publicEmail: publicEmail.trim() || undefined,
        publicPhone: publicPhone.trim() || undefined,
        metaDescription: metaDescription.trim() || undefined,
        sections,
        presentation: currentPresentation,
        ...(site?.media || media.gallery.length || media.team.length ? { media } : {}),
        ...(site?.resources || resourceEntries.length ? { resources: resourceEntries } : {}),
      });
      images.markSaved();
      setDirty(false);
      setSaved(true);
    } catch (err) {
      const isSectionError = err instanceof ConvexError && typeof err.data === "object" &&
        err.data !== null && "code" in err.data && err.data.code === "INVALID_MINI_SITE_SECTIONS";
      const data = err instanceof ConvexError ? err.data : null;
      const presentationError = typeof data === "object" && data !== null && "code" in data &&
        data.code === "INVALID_MINI_SITE_PRESENTATION" && "field" in data ? data.field : null;
      setError(presentationError ? t(`sitePresentation.errors.${presentationError}`)
        : isSectionError ? t("miniSiteSections.invalid") : err instanceof Error ? err.message : t("miniSiteSections.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const addService = () => {
    if (services.length < SITE_CONTENT_LIMITS.services) {
      setServices([...services, { name: "" }]);
      markDirty();
    }
  };

  const updateService = (index: number, changes: Partial<ServiceDraft>) => {
    setServices((current) => current.map((service, i) => i === index ? { ...service, ...changes } : service));
    markDirty();
  };

  const removeService = (index: number) => {
    setServices(services.filter((_, i) => i !== index));
    markDirty();
  };

  return (
    <div>
      <PageHeader
        title={t("siteBuilder.title")}
        description={t("guidance.owner.siteSetup")}
      />
      <nav aria-label={t("miniSiteMedia.editorNavigation")} className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium">
        <a className="inline-flex min-h-11 items-center text-primary-700 underline" href="#site-business">{t("miniSiteMedia.business")}</a>
        <a className="inline-flex min-h-11 items-center text-primary-700 underline" href="#microsite-sections-heading">{t("miniSiteSections.title")}</a>
        <a className="inline-flex min-h-11 items-center text-primary-700 underline" href="#site-quote">{t("miniSiteMedia.quote")}</a>
        <button type="button" className="btn-secondary touch-target inline-flex items-center gap-2" onClick={() => setPreviewOpen(true)}>
          <Eye className="h-4 w-4" aria-hidden="true" />
          {t("miniSiteSections.preview")}
        </button>
      </nav>

      {site && (
        <section className="card mb-6 overflow-hidden border-primary-100 bg-primary-50/40" aria-labelledby="site-overview-title">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-700">
                <Globe2 className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">{sitePublished ? "Published mini-site" : "Draft mini-site"}</p>
                <h2 id="site-overview-title" className="mt-1 break-words text-lg font-semibold text-gray-900">{site.brandName}</h2>
                <p className="mt-1 break-all text-sm text-gray-600">{window.location.origin}/{site.slug}</p>
              </div>
            </div>
            {sitePublished && <a href={`/${site.slug}`} target="_blank" rel="noopener noreferrer" className="btn-primary touch-target inline-flex w-full items-center justify-center gap-2 sm:w-auto">
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {t("common.open")}
            </a>}
          </div>
        </section>
      )}

      {site && !site.bio && !site.serviceArea && !sitePublished && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
          Add a description and primary service area before publishing.
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

      <form id="site-business" onSubmit={handleSubmit} className="card">
        <fieldset disabled={saving} className="min-w-0 space-y-5">
        <section aria-labelledby="get-found-heading" className="rounded-lg border border-primary-100 bg-primary-50/40 p-4">
          <h2 id="get-found-heading" className="text-lg font-semibold text-gray-900">Get Found on Google</h2>
          <p className="mt-1 text-sm text-gray-600">Add accurate details below so customers and search engines can understand your business. Publishing makes these details public; it does not guarantee search placement.</p>
          <p className="mt-3 text-sm font-semibold text-gray-800">Setup completeness: {[
            !!bio.trim(), !!serviceArea.trim(), serviceNames.length > 0, !!(publicEmail.trim() || publicPhone.trim()), additionalServiceAreas.some(value => !!value.trim()),
          ].filter(Boolean).length * 20}%</p>
          <ul className="mt-1 grid gap-1 text-sm text-gray-700 sm:grid-cols-2">
            {[["Business description added", !!bio.trim()], ["Primary service area added", !!serviceArea.trim()], ["Services confirmed", serviceNames.length > 0], ["Public contact configured", !!(publicEmail.trim() || publicPhone.trim())], ["Additional service areas added", additionalServiceAreas.some(value => !!value.trim())]].map(([label, complete]) => <li key={String(label)}>{complete ? "✓" : "○"} {label}</li>)}
          </ul>
          <label className="mt-4 flex items-start gap-2 text-sm text-gray-800">
            <input type="checkbox" className="mt-1" checked={isPublished} onChange={event => { setIsPublished(event.target.checked); markDirty(); }} />
            <span>Publish my mini-site and make these business details visible to everyone</span>
          </label>
        </section>
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
                markDirty();
              }}
              required
              placeholder="my-cleaning-co"
              pattern={"[a-z0-9][a-z0-9\\-]{1,48}[a-z0-9]"}
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
                onClick={() => { setTemplateId(tpl); markDirty(); }}
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
            onChange={(e) => { setBrandName(e.target.value); markDirty(); }}
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
            onChange={(e) => { setBio(e.target.value); markDirty(); }}
            required={isPublished}
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
            onChange={(e) => { setServiceArea(e.target.value); markDirty(); }}
            required={isPublished}
            placeholder="Austin, TX metro area"
          />
        </div>

        {/* Services list */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Additional service areas <span className="font-normal text-gray-400">(optional, up to {MAX_ADDITIONAL_AREAS})</span></label>
          <div className="space-y-2">
            {additionalServiceAreas.map((area, index) => <div key={index} className="flex gap-2">
              <input className="input-field flex-1" value={area} maxLength={80} placeholder="City, State" onChange={event => { const next = [...additionalServiceAreas]; next[index] = event.target.value; setAdditionalServiceAreas(next); markDirty(); }} />
              <button type="button" className="touch-target text-red-600" onClick={() => { setAdditionalServiceAreas(additionalServiceAreas.filter((_, i) => i !== index)); markDirty(); }}>Remove</button>
            </div>)}
          </div>
          {additionalServiceAreas.length < MAX_ADDITIONAL_AREAS && <button type="button" className="mt-2 text-sm text-primary-600" onClick={() => { setAdditionalServiceAreas([...additionalServiceAreas, ""]); markDirty(); }}>Add an area</button>}
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
              <div key={i} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-center gap-2">
                <input
                  className="input-field min-w-0 flex-1"
                  value={svc.name}
                  onChange={(e) => updateService(i, { name: e.target.value.slice(0, SITE_CONTENT_LIMITS.serviceName) })}
                  aria-label={t("sitePresentation.serviceName", { number: i + 1 })}
                  placeholder={t("sitePresentation.serviceName", { number: i + 1 })}
                  maxLength={SITE_CONTENT_LIMITS.serviceName}
                />
                <button
                  type="button"
                  onClick={() => removeService(i)}
                  className="touch-target flex shrink-0 items-center justify-center text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-100"
                  aria-label={`${t("common.delete")} ${svc.name || i + 1}`}
                >
                  <X className="w-4 h-4" />
                </button>
                </div>
                {svc.name.trim() && (
                  <details className="mt-2">
                    <summary className="cursor-pointer py-2 text-sm font-medium text-primary-700">{t("sitePresentation.serviceDetails")}</summary>
                    <div className="grid gap-3 pt-2">
                      {(["description", "included", "excluded"] as const).map((field) => (
                        <label key={field} className="block text-sm font-medium text-gray-700">
                          {t(`sitePresentation.${field}`)}
                          <textarea className="input-field mt-1" rows={2} maxLength={SITE_CONTENT_LIMITS.serviceText} value={svc[field] ?? ""}
                            onChange={(event) => updateService(i, { [field]: event.target.value })} />
                        </label>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
          {services.length < SITE_CONTENT_LIMITS.services && (
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
              onChange={(e) => { setPublicEmail(e.target.value); markDirty(); }}
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
              onChange={(e) => { setPublicPhone(e.target.value); markDirty(); }}
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
            onChange={(e) => { setLogoUrl(e.target.value); markDirty(); }}
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
            onChange={(e) => { setHeroImageUrl(e.target.value); markDirty(); }}
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
              markDirty();
            }}
            placeholder={t("siteBuilder.metaPlaceholder")}
            maxLength={160}
          />
          <p className="text-xs text-gray-400 mt-1">
            {metaDescription.length}/160
          </p>
        </div>

        <MiniSiteSectionEditor
          sections={sections}
          onChange={(next) => { setSections(next); markDirty(); }}
          onEditSection={(id) => {
            setMediaPanel(id === "gallery" || id === "team" ? id : false);
            setResourcePanel(id === "resources");
          }}
          settings={{
            resources: <MicrositeResourceFields entries={resourceEntries} rows={documentRows} sessionToken={sessionToken}
              published={sitePublished && !site?.mediaDeliverySuspended && site?.sections?.some(({ id, enabled }) => id === "resources" && enabled) ? site.resources ?? [] : []}
              onChange={(update) => { setResourceEntries(update); markDirty(); }} />,
            gallery: <GalleryFields entries={media.gallery} images={images} onChange={(update) => {
              setMedia((current) => ({ ...current, gallery: update(current.gallery) }));
              markDirty();
            }} />,
            team: <TeamFields entries={media.team} images={images} onChange={(update) => {
              setMedia((current) => ({ ...current, team: update(current.team) }));
              markDirty();
            }} />,
            businessHours: <BusinessHoursFields hours={presentation.hours ?? []} onChange={(hours) => updatePresentation({ hours })} />,
            socialProfiles: <>
              <p className="text-sm text-gray-600">{t("sitePresentation.socialHelp")}</p>
              <ProfileFields type="socials" profiles={presentation.socials ?? []} onChange={(socials) => updatePresentation({ socials })} />
            </>,
            reviews: <>
              <p className="text-sm text-gray-600">{t("miniSiteSections.sources.reviews")}</p>
              <label className="flex min-h-11 items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={presentation.externalReviewsEnabled ?? false}
                  onChange={(event) => updatePresentation({ externalReviewsEnabled: event.target.checked })} />
                {t("sitePresentation.showExternalReviews")}
              </label>
              <p className="text-sm text-gray-600">{t("sitePresentation.reviewsHelp")}</p>
              <ProfileFields type="externalReviews" profiles={presentation.externalReviews ?? []}
                onChange={(externalReviews) => updatePresentation({ externalReviews })} />
            </>,
          }}
        />
        <div id="site-quote"><QuoteFields quote={presentation.quote} onChange={(quote) => updatePresentation({ quote })} /></div>

        <div className="pt-2">
          <p className="mb-2 text-sm text-gray-600">{t("miniSiteMedia.publicationHelp")}</p>
          {images.blocked && <p role="status" className="mb-2 text-sm text-gray-700">{t("miniSiteMedia.waitToSave")}</p>}
          {error && (
            <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
          )}
          <p aria-live="polite" className="mb-2 text-sm text-gray-600">
            {saving ? t("miniSiteSections.saving") : dirty ? t("miniSiteSections.unsaved") : saved ? t("siteBuilder.siteSaved") : ""}
          </p>
          <button
            type="submit"
            disabled={saving || images.blocked}
            className="btn-primary touch-target w-full flex items-center justify-center gap-2"
          >
            {saving && <LoadingSpinner size="sm" />}
            {site ? t("siteBuilder.saveChanges") : t("siteBuilder.createSite")}
          </button>
        </div>
        </fieldset>
      </form>

      <DialogShell
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={t("miniSiteSections.preview")}
        description={t("miniSiteSections.previewHelp")}
        className="!max-w-6xl"
        bodyClassName="!p-0"
      >
        {previewContent ? (
          <MiniSiteContent
            preview
            slug={slug}
            publicRequestToken={site?.publicRequestToken ?? null}
            site={{
              templateId, brandName: brandName.trim(), bio: bio.trim(), serviceArea: serviceArea.trim(),
              additionalServiceAreas: normalizedAdditionalAreas(additionalServiceAreas, serviceArea),
              services: serviceNames,
              resources: resourceEntries.flatMap((entry) => {
                const row = documentRows?.find(({ id }) => id === entry.resourceId);
                return entry.enabled && row?.eligible
                  ? [{ id: entry.id, title: entry.title, description: entry.description, bytes: row.bytes }]
                  : [];
              }),
              presentation: publicMiniSitePresentation(currentPresentation, serviceNames, sections),
              media: projectMicrositeMedia(media, {
                gallery: sections.some(({ id, enabled }) => id === "gallery" && enabled),
                team: sections.some(({ id, enabled }) => id === "team" && enabled),
              }, ({ assetId }) => images.source(assetId)),
              logoUrl: logoUrl.trim(), heroImageUrl: heroImageUrl.trim(),
              publicEmail: publicEmail.trim(), publicPhone: publicPhone.trim(),
            }}
            sections={publicMiniSiteSections(sections)}
            reviews={previewContent.reviews}
            addOns={previewContent.addOns}
          />
        ) : <PageLoader />}
      </DialogShell>

      {/* Share Kit */}
      {site && sitePublished && (
        <ShareKit
          slug={site.slug}
          publicRequestToken={site.publicRequestToken}
          brandName={site.brandName}
        />
      )}
    </div>
  );
}
