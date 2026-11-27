import { createContext, useContext, useEffect, useState, type ComponentPropsWithoutRef } from "react";
import { useParams } from "wouter";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { miniSiteSectionHeadingKey, publicMiniSiteSections, supportedHighlightIcon, type HighlightIcon, type PublicMiniSiteSections } from "../../../../../convex/lib/miniSiteSections";
import { SITE_CONTENT_LIMITS, type MiniSiteHours, type MiniSiteProfile, type PublicMiniSitePresentation } from "../../../../../convex/lib/miniSitePresentation";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { encodePublicAddOnSelection, formatPublicAddOnPrice } from "@/lib/publicAddOnPresentation";
import { miniSiteCanonical, miniSiteDescription, miniSiteTitle, safePublicImage } from "../../../../../convex/lib/miniSiteSeo";
import {
  MapPin,
  Mail,
  Phone,
  PhoneCall,
  Star,
  Shield,
  Leaf,
  Award,
  Calendar,
  Check,
  Clock,
  Handshake,
  Heart,
  Users,
  Sparkles,
  Home,
  Building2,
  Truck,
  HardHat,
  ClipboardCheck,
  ChevronDown,
  ArrowRight,
  ExternalLink,
  Facebook,
  Instagram,
  Linkedin,
  Music2,
  Youtube,
} from "lucide-react";

// ── SEO helper ────────────────────────────────────────────────────────

function usePageMeta(meta: {
  title: string;
  description: string;
  url: string;
  image: string;
  ogType?: string;
} | null) {
  useEffect(() => {
    if (!meta) return;

    const prev = document.title;
    document.title = meta.title;

    const tags: { name?: string; property?: string; content: string }[] = [
      { name: "description", content: meta.description },
      { property: "og:title", content: meta.title },
      { property: "og:description", content: meta.description },
      { property: "og:url", content: meta.url },
      { property: "og:image", content: meta.image },
      { property: "og:type", content: meta.ogType ?? "website" },
      { name: "twitter:title", content: meta.title },
      { name: "twitter:description", content: meta.description },
      { name: "twitter:image", content: meta.image },
    ];

    const created: HTMLMetaElement[] = [];
    const restored: Array<[HTMLMetaElement, string | null]> = [];
    for (const tag of tags) {
      const selector = tag.property
        ? `meta[property="${tag.property}"]`
        : `meta[name="${tag.name}"]`;
      let el = document.querySelector<HTMLMetaElement>(selector);
      if (!el) {
        el = document.createElement("meta");
        if (tag.property) el.setAttribute("property", tag.property);
        if (tag.name) el.setAttribute("name", tag.name);
        document.head.appendChild(el);
        created.push(el);
      } else {
        restored.push([el, el.getAttribute("content")]);
      }
      el.setAttribute("content", tag.content);
    }
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const previousCanonical = canonical?.getAttribute("href") ?? null;
    if (canonical) canonical.href = meta.url;

    return () => {
      document.title = prev;
      created.forEach((el) => el.remove());
      restored.forEach(([el, value]) => value === null ? el.removeAttribute("content") : el.setAttribute("content", value));
      if (canonical && previousCanonical !== null) canonical.setAttribute("href", previousCanonical);
    };
  }, [meta?.title, meta?.description, meta?.url, meta?.image, meta?.ogType]);
}

// ── Helpers ───────────────────────────────────────────────────────────

/** Strip non-digit chars for tel: links */
function toTelHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

// ── Types ─────────────────────────────────────────────────────────────

interface SiteData {
  presentation?: PublicMiniSitePresentation;
  templateId: string;
  brandName: string;
  bio: string;
  serviceArea: string;
  additionalServiceAreas: string[];
  logoUrl?: string | null;
  heroImageUrl?: string | null;
  services: string[];
  publicEmail?: string | null;
  publicPhone?: string | null;
  metaDescription?: string | null;
}

interface ReviewData {
  id: string;
  rating: number;
  comment: string | null;
  displayName: string | null;
  createdAt: number;
}

interface PublicAddOnData {
  addOnId: string;
  name: string;
  description: string | null;
  pricingMethod: "flat" | "starting_at" | "per_unit";
  priceCents: number;
  unitLabel: string | null;
  selectionVersion: string;
}

// ── Page component ───────────────────────────────────────────────────

export function PublicSitePage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "";

  const site = useQuery(
    api.queries.companySites.getBySlug,
    slug ? { slug } : "skip"
  );

  const reviews = useQuery(
    api.queries.companySites.getReviewedFeedbackBySlug,
    slug ? { slug, limit: 6 } : "skip"
  );

  const addOns = useQuery(
    api.queries.companyAddOns.listPublic,
    slug ? { slug } : "skip"
  );

  // Set SEO tags when site data loads
  usePageMeta(
    site
      ? {
          title: miniSiteTitle(site),
          description: miniSiteDescription(site),
          url: miniSiteCanonical(site.slug),
          image: safePublicImage(site.heroImageUrl) ?? safePublicImage(site.logoUrl) ?? "https://scrubscrubscrub.com/scrub-social-preview.png",
        }
      : null
  );

  if (site === undefined) {
    return (
      <div className="min-h-screen bg-white flex justify-center items-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (site === null) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center text-center px-4">
        <h2 className="text-2xl font-bold text-gray-900 mb-3">
          Page not found
        </h2>
        <p className="text-gray-500 mb-6">
          This site doesn&rsquo;t exist or has been removed.
        </p>
        <a
          href="/"
          className="text-primary-600 hover:underline font-medium"
        >
          &larr; Back to home
        </a>
      </div>
    );
  }

  return (
    <MiniSiteContent
      site={site}
      slug={slug}
      publicRequestToken={site.publicRequestToken}
      sections={site.sections ?? publicMiniSiteSections(undefined)}
      reviews={reviews ?? []}
      addOns={addOns ?? []}
    />
  );
}

const MiniSitePreviewContext = createContext(false);

function SiteLink({ children, className, ...props }: ComponentPropsWithoutRef<"a">) {
  const preview = useContext(MiniSitePreviewContext);
  return preview
    ? <span className={className} role="link" aria-label={props["aria-label"]} aria-disabled="true">{children}</span>
    : <a className={className} {...props}>{children}</a>;
}

export function MiniSiteContent({
  site, sections, slug, publicRequestToken, reviews, addOns, preview = false,
}: {
  site: SiteData;
  sections: PublicMiniSiteSections;
  slug: string;
  publicRequestToken: string | null;
  reviews: ReviewData[];
  addOns: PublicAddOnData[];
  preview?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const requestHref = publicRequestToken ? `/r/${publicRequestToken}` : null;
  const cleanerHref = `/${slug}/cleaner`;
  const isDark = site.templateId === "B";
  const presentation = site.presentation;
  const quoteLabel = presentation?.quote?.label;

  return (
    <MiniSitePreviewContext.Provider value={preview}>
    <div className={`min-h-screen [overflow-wrap:anywhere] ${isDark ? "bg-gray-950" : "bg-white"}`}>
      {/* ── Navigation bar ─────────────────────────────────────── */}
      <nav
        className={`${preview ? "" : "sticky top-0 z-50"} backdrop-blur-sm border-b ${
          isDark
            ? "bg-gray-950/95 border-gray-800"
            : "bg-white/95 border-gray-100"
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 min-h-16 py-2 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {site.logoUrl ? (
              <img
                src={site.logoUrl}
                alt={site.brandName}
                className="h-9 w-9 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <div className="h-9 w-9 shrink-0 rounded-lg bg-primary-600 flex items-center justify-center">
                <span className="text-white font-bold text-sm">
                  {site.brandName.charAt(0)}
                </span>
              </div>
            )}
            <span
              className={`min-w-0 truncate text-sm font-bold sm:text-lg ${isDark ? "text-white" : "text-gray-900"}`}
              title={site.brandName}
            >
              {site.brandName}
            </span>
          </div>
          <div className="flex max-w-[60%] shrink-0 items-center gap-2 sm:max-w-[55%]">
            {site.publicPhone && (
              <SiteLink
                href={toTelHref(site.publicPhone)}
                className={`hidden sm:flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
                  isDark
                    ? "text-gray-300 hover:text-white hover:bg-gray-800"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                }`}
              >
                <PhoneCall className="w-4 h-4" />
                Call / Text
              </SiteLink>
            )}
            <QuoteButton href={requestHref} label={quoteLabel ?? t("sitePresentation.quoteNav")} size="sm" />
          </div>
        </div>
      </nav>

      {/* ── Hero section ───────────────────────────────────────── */}
      <HeroSection
        site={site}
        requestHref={requestHref}
        cleanerHref={cleanerHref}
        isDark={isDark}
        quoteLabel={quoteLabel ?? t("sitePresentation.quoteDefault")}
      />

      {sections.map((section) => {
        const heading = section.heading || t(miniSiteSectionHeadingKey(section.id));
        switch (section.id) {
          case "services":
            return site.services.length ? <ServicesSection key={section.id} heading={heading} services={site.services} details={presentation?.serviceDetails} requestHref={requestHref} isDark={isDark} /> : null;
          case "addOns":
            return <AddOnsSection key={section.id} heading={heading} addOns={addOns} isDark={isDark} locale={i18n.resolvedLanguage ?? i18n.language} t={t} requestHref={requestHref} />;
          case "serviceArea":
            return site.serviceArea || site.additionalServiceAreas.length
              ? <ServiceAreaSection key={section.id} heading={heading} serviceArea={site.serviceArea} additionalServiceAreas={site.additionalServiceAreas} isDark={isDark} />
              : null;
          case "reviews":
            return reviews.length || presentation?.externalReviews?.length
              ? <ReviewsSection key={section.id} heading={heading} reviews={reviews} profiles={presentation?.externalReviews} isDark={isDark} /> : null;
          case "businessHours":
            return presentation?.hours?.length ? <BusinessHoursSection key={section.id} heading={heading} hours={presentation.hours} isDark={isDark} /> : null;
          case "socialProfiles":
            return presentation?.socials?.length ? <section key={section.id} className={`px-4 py-14 text-center ${isDark ? "text-white" : "text-gray-900"}`}>
              <h2 className="mb-6 text-3xl font-bold">{heading}</h2>
              <ProfileLinks profiles={presentation.socials} isDark={isDark} />
            </section> : null;
          case "howItWorks":
          case "highlights":
          case "faq":
          case "policies":
            return <InformationalSection key={section.id} section={section} heading={heading} isDark={isDark} />;
        }
      })}

      {/* ── Final CTA ──────────────────────────────────────────── */}
      <CTASection
        brandName={site.brandName}
        requestHref={requestHref}
        cleanerHref={cleanerHref}
        quoteLabel={quoteLabel ?? t("sitePresentation.quoteFree")}
        quoteText={presentation?.quote?.text}
      />

      {/* ── Footer ─────────────────────────────────────────────── */}
      <FooterSection
        brandName={site.brandName}
        email={site.publicEmail}
        phone={site.publicPhone}
        serviceArea={site.serviceArea}
      />

      {/* ── Sticky mobile CTA ──────────────────────────────────── */}
      <div
        className={`sm:hidden ${preview ? "sticky bottom-0" : "fixed bottom-0 left-0 right-0 z-50"} border-t p-3 ${
          isDark ? "bg-gray-950 border-gray-800" : "bg-white border-gray-200"
        }`}
      >
        <div className="flex gap-2">
          {site.publicPhone && (
            <SiteLink
              href={toTelHref(site.publicPhone)}
              className={`flex items-center justify-center gap-1.5 py-3 px-4 rounded-lg font-medium text-sm border transition-colors ${
                isDark
                  ? "border-gray-700 text-gray-200 hover:bg-gray-800"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <PhoneCall className="w-4 h-4" />
              Call
            </SiteLink>
          )}
          {requestHref ? (
            <SiteLink
              href={requestHref}
              className="btn-primary flex-1 text-center py-3 block font-semibold"
            >
              {quoteLabel ?? t("sitePresentation.quoteFree")}
            </SiteLink>
          ) : (
            <span className="flex-1 text-center py-3 block font-semibold rounded-lg bg-gray-300 text-gray-500 cursor-not-allowed text-sm">
              {t("sitePresentation.quoteUnavailable")}
            </span>
          )}
        </div>
      </div>
    </div>
    </MiniSitePreviewContext.Provider>
  );
}

// ── Shared: Quote button (handles null href) ─────────────────────────

function QuoteButton({
  href,
  label,
  size = "md",
  className = "",
}: {
  href: string | null;
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const { t } = useTranslation();
  const sizeClasses = size === "sm" ? "px-3 py-2 text-sm sm:px-4" : "text-base px-8 py-3";

  if (href) {
    return (
      <SiteLink
        href={href}
        className={`btn-primary min-w-0 text-center ${sizeClasses} ${className}`}
      >
        {label}
      </SiteLink>
    );
  }

  return (
    <span
      className={`inline-block rounded-lg font-medium bg-gray-300 text-gray-500 cursor-not-allowed ${sizeClasses} ${className}`}
      title={t("sitePresentation.quoteUnavailable")}
    >
      {label}
    </span>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────

function HeroSection({
  site,
  requestHref,
  cleanerHref,
  isDark,
  quoteLabel,
}: {
  site: SiteData;
  requestHref: string | null;
  cleanerHref: string;
  isDark: boolean;
  quoteLabel: string;
}) {
  const { t } = useTranslation();
  const hasHero = !!site.heroImageUrl;
  // For dark template without a hero image, use a dark gradient
  const useLightOnDark = isDark || hasHero;

  return (
    <section
      className={`relative ${useLightOnDark ? "text-white" : "text-gray-900"}`}
      style={
        hasHero
          ? {
              backgroundImage: `linear-gradient(135deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.4) 100%), url(${site.heroImageUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : isDark
            ? {
                background:
                  "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
              }
            : {
                background:
                  "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #f0fdf4 100%)",
              }
      }
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-20 sm:py-28 text-center">
        {site.logoUrl && !hasHero && (
          <img
            src={site.logoUrl}
            alt={site.brandName}
            className="h-20 w-auto mx-auto mb-6 object-contain"
          />
        )}
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4">
          {site.brandName}
        </h1>
        {site.bio && <p
          className={`text-lg sm:text-xl max-w-2xl mx-auto mb-2 ${
            useLightOnDark ? "text-gray-200" : "text-gray-600"
          }`}
        >
          {site.bio}
        </p>}
        <p
          className={`flex items-center justify-center gap-1.5 mb-8 text-sm ${
            useLightOnDark ? "text-gray-300" : "text-gray-500"
          }`}
        >
          <MapPin className="w-4 h-4" />
          {site.serviceArea ? `Serving ${site.serviceArea}` : "Contact us about your area"}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          {requestHref ? (
            <SiteLink
              href={requestHref}
              className="btn-primary text-base px-8 py-3 shadow-lg hover:shadow-xl transition-shadow flex items-center gap-2"
            >
              <span>{quoteLabel}</span>
              <ArrowRight className="w-4 h-4" />
            </SiteLink>
          ) : (
            <span className="inline-flex items-center gap-2 px-8 py-3 rounded-lg font-medium text-base bg-gray-400 text-gray-200 cursor-not-allowed">
              <span>{quoteLabel}</span>
              <ArrowRight className="w-4 h-4" />
            </span>
          )}
          <SiteLink
            href={cleanerHref}
            className={`px-6 py-3 rounded-lg font-medium text-base transition-colors ${
              useLightOnDark
                ? "bg-white/15 text-white hover:bg-white/25 border border-white/30"
                : "btn-secondary"
            }`}
          >
            Join Our Team
          </SiteLink>
        </div>
        {!requestHref && (
          <p className="mt-3 text-xs text-gray-400">
            {t("sitePresentation.quoteUnavailable")}
          </p>
        )}
      </div>
    </section>
  );
}

// ── Services ──────────────────────────────────────────────────────────

const SERVICE_ICONS = [Sparkles, Home, Truck, Building2, HardHat, ClipboardCheck];

function ServicesSection({
  heading,
  services,
  details,
  requestHref,
  isDark,
}: {
  heading: string;
  services: string[];
  details?: PublicMiniSitePresentation["serviceDetails"];
  requestHref: string | null;
  isDark: boolean;
}) {
  const { t } = useTranslation();
  const cards = services.slice(0, SITE_CONTENT_LIMITS.services).map((svc, i) => ({
    index: i,
    name: svc,
    detail: details?.find(({ index }) => index === i),
    icon: SERVICE_ICONS[i % SERVICE_ICONS.length],
  })).filter(({ name }) => name.trim());
  if (!cards.length) return null;

  return (
    <section className={`py-16 sm:py-20 ${isDark ? "bg-gray-950" : ""}`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <h2
            className={`text-3xl font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}
          >
            {heading}
          </h2>
          <p className={isDark ? "text-gray-400" : "text-gray-500"}>
            {t("sitePresentation.servicesHelp")}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {cards.map((card) => (
            <div
              key={card.index}
              className={`group rounded-xl border p-6 hover:shadow-md transition-all ${
                isDark
                  ? "bg-gray-900 border-gray-800 hover:border-primary-700"
                  : "bg-white border-gray-200 hover:border-primary-200"
              }`}
            >
              <div
                className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 transition-colors ${
                  isDark
                    ? "bg-primary-900/50 group-hover:bg-primary-900"
                    : "bg-primary-50 group-hover:bg-primary-100"
                }`}
              >
                <card.icon className="w-6 h-6 text-primary-500" />
              </div>
              <h3
                className={`font-semibold mb-2 ${isDark ? "text-white" : "text-gray-900"}`}
              >
                {card.name}
              </h3>
              {card.detail && (
                <details className={`mb-3 rounded-lg border px-3 text-sm ${isDark ? "border-gray-700 text-gray-300" : "border-gray-200 text-gray-700"}`}>
                  <summary className="cursor-pointer py-2 font-medium">{t("sitePresentation.serviceDetails")}<span className="sr-only"> {card.name}</span></summary>
                  <div className="space-y-3 pb-3">
                    {card.detail.description && <p className="whitespace-pre-wrap">{card.detail.description}</p>}
                    {(["included", "excluded"] as const).map((field) => card.detail?.[field] && (
                      <div key={field}>
                        <h4 className="font-semibold">{t(`sitePresentation.${field}`)}</h4>
                        <p className="whitespace-pre-wrap">{card.detail[field]}</p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {requestHref && (
                <SiteLink
                  href={`${requestHref}?service=${encodeURIComponent(card.name)}`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary-500 hover:text-primary-400"
                >
                  {t("sitePresentation.serviceQuote")} <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </SiteLink>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AddOnsSection({
  heading,
  addOns,
  isDark,
  locale,
  t,
  requestHref,
}: {
  heading: string;
  addOns: PublicAddOnData[];
  isDark: boolean;
  locale: string;
  t: (key: string, options?: Record<string, unknown>) => string;
  requestHref: string | null;
}) {
  const [selected, setSelected] = useState<Record<string, { selectionVersion: string; quantity?: number }>>({});
  if (addOns.length === 0) return null;

  const priceLabel = (addOn: PublicAddOnData) => formatPublicAddOnPrice(addOn, locale, {
    startingAt: (price) => t("publicSite.addOns.startingAt", { price }),
    perUnit: (price, unit) => t("publicSite.addOns.perUnit", { price, unit }),
  });
  const selectedEntries = Object.entries(selected);
  const continueHref = requestHref && selectedEntries.length
    ? `${requestHref}?${selectedEntries.map(([companyAddOnId, value]) => `addOn=${encodeURIComponent(encodePublicAddOnSelection({ companyAddOnId, ...value }))}`).join("&")}`
    : requestHref;

  return (
    <section className={`py-16 sm:py-20 ${isDark ? "bg-gray-900" : "bg-gray-50"}`}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-10 text-center">
          <h2 className={`mb-3 text-3xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
            {heading}
          </h2>
          <p className={isDark ? "text-gray-400" : "text-gray-500"}>
            {t("publicSite.addOns.description")}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {addOns.map((addOn) => (
            <article
              key={addOn.addOnId}
              className={`rounded-xl border p-6 ${
                selected[addOn.addOnId]
                  ? "border-primary-500 ring-2 ring-primary-500/20"
                  : isDark ? "border-gray-700" : "border-gray-200"
              } ${
                isDark ? "bg-gray-950" : "bg-white"
              }`}
            >
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  checked={Boolean(selected[addOn.addOnId])}
                  disabled={!selected[addOn.addOnId] && selectedEntries.length >= 20}
                  onChange={(event) => setSelected((current) => {
                    if (!event.target.checked) {
                      const next = { ...current }; delete next[addOn.addOnId]; return next;
                    }
                    return { ...current, [addOn.addOnId]: { selectionVersion: addOn.selectionVersion, quantity: addOn.pricingMethod === "per_unit" ? 1 : undefined } };
                  })}
                  aria-label={t("publicSite.addOns.select", { name: addOn.name })}
                />
                <span className={`font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>{addOn.name}</span>
              </label>
              {addOn.description && (
                <p className={`mt-2 text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                  {addOn.description}
                </p>
              )}
              <p className="mt-4 font-semibold text-primary-500">{priceLabel(addOn)}</p>
              {addOn.pricingMethod === "per_unit" && selected[addOn.addOnId] && (
                <label className={`mt-4 block text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                  {t("publicSite.addOns.quantity")}
                  <input
                    type="number"
                    min={1}
                    max={999}
                    step={1}
                    className="input-field mt-1"
                    value={selected[addOn.addOnId].quantity ?? 1}
                    onChange={(event) => setSelected((current) => ({ ...current, [addOn.addOnId]: { ...current[addOn.addOnId], quantity: Number(event.target.value) } }))}
                  />
                </label>
              )}
            </article>
          ))}
        </div>
        {addOns.some((addOn) => addOn.pricingMethod !== "flat") && (
          <p className={`mt-6 text-center text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>
            {t("publicSite.addOns.pricingBasisNote")}
          </p>
        )}
        {continueHref && selectedEntries.length > 0 && (
          <div className="mt-8 text-center">
            <SiteLink className="btn-primary inline-flex" href={continueHref}>
              {t("publicSite.addOns.continue", { count: selectedEntries.length })}
            </SiteLink>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Service area ──────────────────────────────────────────────────────

function ServiceAreaSection({
  heading,
  serviceArea,
  additionalServiceAreas,
  isDark,
}: {
  heading: string;
  serviceArea: string;
  additionalServiceAreas: string[];
  isDark: boolean;
}) {
  return (
    <section className={`py-16 sm:py-20 ${isDark ? "bg-gray-950" : ""}`}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
        <div
          className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${
            isDark ? "bg-primary-900/50" : "bg-primary-50"
          }`}
        >
          <MapPin className="w-7 h-7 text-primary-500" />
        </div>
        <h2
          className={`text-3xl font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}
        >
          {heading}
        </h2>
        <p className={`text-lg ${isDark ? "text-gray-300" : "text-gray-600"}`}>
          Serving <span className="font-semibold">{[serviceArea, ...additionalServiceAreas].filter(Boolean).join(", ")}</span>.
        </p>
      </div>
    </section>
  );
}

// ── Reviews ───────────────────────────────────────────────────────────

function ReviewsSection({
  heading,
  reviews,
  profiles,
  isDark,
}: {
  heading: string;
  reviews: ReviewData[];
  profiles?: MiniSiteProfile[];
  isDark: boolean;
}) {
  const { t } = useTranslation();
  const avgRating = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;

  return (
    <section
      className={`py-16 sm:py-20 ${isDark ? "bg-gray-900" : "bg-gray-50"}`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <h2
            className={`text-3xl font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}
          >
            {heading}
          </h2>
          {!!reviews.length && <div className="flex items-center justify-center gap-2">
            <StarRating rating={Math.round(avgRating)} />
            <span className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              {avgRating.toFixed(1)} average from {reviews.length} review{reviews.length !== 1 ? "s" : ""}
            </span>
          </div>}
        </div>

        {reviews.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {reviews.map((review) => (
              <div
                key={review.id}
                className={`rounded-xl border p-6 ${
                  isDark
                    ? "bg-gray-800 border-gray-700"
                    : "bg-white border-gray-200"
                }`}
              >
                <StarRating rating={review.rating} />
                {review.comment && (
                  <p
                    className={`mt-3 text-sm line-clamp-4 ${
                      isDark ? "text-gray-300" : "text-gray-700"
                    }`}
                  >
                    &ldquo;{review.comment}&rdquo;
                  </p>
                )}
                <div className="mt-4 flex items-center justify-between">
                  <span
                    className={`text-sm font-medium ${isDark ? "text-white" : "text-gray-900"}`}
                  >
                    {review.displayName ?? "Client"}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(review.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        {profiles?.length ? (
          <div className={`text-center ${reviews.length ? "mt-10 border-t pt-6" : ""} ${isDark ? "border-gray-700 text-white" : "border-gray-200 text-gray-900"}`}>
            <h3 className="mb-4 font-semibold">{t("sitePresentation.externalReviewsTitle")}</h3>
            <ProfileLinks profiles={profiles} isDark={isDark} reviews />
          </div>
        ) : null}
      </div>
    </section>
  );
}

const SOCIAL_ICONS = { facebook: Facebook, instagram: Instagram, tiktok: Music2, linkedin: Linkedin, youtube: Youtube };

function ProfileLinks({ profiles, isDark, reviews = false }: { profiles: MiniSiteProfile[]; isDark: boolean; reviews?: boolean }) {
  const { t } = useTranslation();
  return (
    <ul className="flex flex-wrap justify-center gap-3" role="list">
      {profiles.map(({ platform, url }) => {
        const Icon = SOCIAL_ICONS[platform as keyof typeof SOCIAL_ICONS] ?? ExternalLink;
        const name = t(`sitePresentation.platforms.${platform}`);
        return (
          <li key={platform}>
            <SiteLink href={url} target="_blank" rel="noopener noreferrer" aria-label={t(reviews ? "sitePresentation.viewReviews" : "sitePresentation.visitProfile", { platform: name })}
              className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold ${isDark ? "border-gray-700 bg-gray-900 text-white hover:bg-gray-800" : "border-gray-200 bg-white text-gray-900 hover:bg-gray-50"}`}>
              <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-primary-500" />{name}
            </SiteLink>
          </li>
        );
      })}
    </ul>
  );
}

function BusinessHoursSection({ heading, hours, isDark }: { heading: string; hours: MiniSiteHours[]; isDark: boolean }) {
  const { t, i18n } = useTranslation();
  const formatTime = (value: string) => {
    const [hour, minute] = value.split(":").map(Number);
    return new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "en", { hour: "numeric", minute: "2-digit", timeZone: "UTC" })
      .format(Date.UTC(2000, 0, 1, hour, minute));
  };
  return (
    <section className={`px-4 py-16 sm:py-20 ${isDark ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-900"}`}>
      <div className="mx-auto max-w-lg">
        <h2 className="text-center text-3xl font-bold">{heading}</h2>
        <p className={`mb-6 mt-3 text-center text-sm ${isDark ? "text-gray-300" : "text-gray-600"}`}>{t("sitePresentation.hoursNote")}</p>
        <dl className={`divide-y rounded-xl border px-4 ${isDark ? "divide-gray-700 border-gray-700" : "divide-gray-200 border-gray-200 bg-white"}`}>
          {hours.map((entry) => (
            <div key={entry.day} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-3 text-sm">
              <dt className="font-semibold">{t(`sitePresentation.days.${entry.day}`)}</dt>
              <dd>{entry.status === "open" ? <><time dateTime={entry.opens}>{formatTime(entry.opens)}</time> – <time dateTime={entry.closes}>{formatTime(entry.closes)}</time></> : t(`sitePresentation.status.${entry.status}`)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`w-5 h-5 ${
            s <= rating
              ? "fill-yellow-400 text-yellow-400"
              : "text-gray-300"
          }`}
        />
      ))}
    </div>
  );
}

const HIGHLIGHT_SYMBOLS = {
  shield: Shield, check: Check, sparkles: Sparkles, leaf: Leaf, clock: Clock, calendar: Calendar,
  heart: Heart, home: Home, users: Users, award: Award, star: Star, handshake: Handshake,
} satisfies Record<HighlightIcon, typeof Shield>;

function InformationalSection({ section, heading, isDark }: {
  section: PublicMiniSiteSections[number];
  heading: string;
  isDark: boolean;
}) {
  const { t } = useTranslation();
  const entries = section.legacyProcess
    ? [1, 2, 3].map((step) => ({
      title: t(`publicSite.legacyProcess.step${step}.title`),
      body: t(`publicSite.legacyProcess.step${step}.body`),
      icon: undefined,
    }))
    : section.entries ?? [];
  if (!entries.length) return null;

  const isFaq = section.id === "faq" || section.id === "policies";
  const isProcess = section.id === "howItWorks";
  const headingColor = isDark ? "text-white" : "text-gray-900";
  return (
    <section className={`py-16 sm:py-20 ${isProcess ? (isDark ? "bg-gray-900" : "bg-gray-50") : ""}`}>
      <div className={`mx-auto px-4 sm:px-6 ${isFaq ? "max-w-3xl" : isProcess ? "max-w-4xl" : "max-w-6xl"}`}>
        <h2 className={`mb-10 break-words text-center text-3xl font-bold ${headingColor}`}>{heading}</h2>
        {section.legacyProcess && (
          <p className={`-mt-7 mb-12 text-center ${isDark ? "text-gray-400" : "text-gray-500"}`}>
            {t("publicSite.legacyProcess.description")}
          </p>
        )}
        {isFaq ? (
          <div className="space-y-4">
            {entries.map(({ title, body }, index) => (
              <FAQItem key={`${title}-${index}`} question={title} answer={body} isDark={isDark} />
            ))}
          </div>
        ) : (
          <ol className={`grid gap-6 sm:grid-cols-2 ${isProcess ? "md:grid-cols-3" : "lg:grid-cols-3"}`} role="list">
            {entries.map(({ title, body, icon }, index) => {
              const Icon = supportedHighlightIcon(icon) ? HIGHLIGHT_SYMBOLS[icon] : null;
              return (
                <li key={`${title}-${index}`} className={`min-w-0 break-words ${isProcess ? "text-center" :
                  `rounded-xl border p-6 ${isDark ? "border-gray-800 bg-gray-900" : "border-gray-200 bg-white"}`}`}>
                  {isProcess && (
                    <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-lg font-bold text-white" aria-hidden="true">
                      {index + 1}
                    </span>
                  )}
                  {!isProcess && Icon && (
                    <Icon className="mb-4 h-6 w-6 text-primary-500" aria-hidden="true" />
                  )}
                  <h3 className={`mb-2 font-semibold ${headingColor}`}>{title}</h3>
                  <p className={`whitespace-pre-wrap text-sm leading-relaxed ${isDark ? "text-gray-300" : "text-gray-600"}`}>{body}</p>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

function FAQItem({
  question,
  answer,
  isDark,
}: {
  question: string;
  answer: string;
  isDark: boolean;
}) {
  return (
    <details
      className={`group rounded-xl border overflow-hidden ${
        isDark
          ? "bg-gray-900 border-gray-800"
          : "bg-white border-gray-200"
      }`}
    >
      <summary className="flex items-center justify-between cursor-pointer px-6 py-4 text-left">
        <span
          className={`min-w-0 break-words font-medium ${isDark ? "text-gray-100" : "text-gray-900"}`}
        >
          {question}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`w-5 h-5 shrink-0 ml-4 group-open:rotate-180 transition-transform ${
            isDark ? "text-gray-500" : "text-gray-400"
          }`}
        />
      </summary>
      <div
        className={`whitespace-pre-wrap break-words px-6 pb-4 text-sm leading-relaxed ${
          isDark ? "text-gray-400" : "text-gray-600"
        }`}
      >
        {answer}
      </div>
    </details>
  );
}

// ── Final CTA ─────────────────────────────────────────────────────────

function CTASection({
  brandName,
  requestHref,
  cleanerHref,
  quoteLabel,
  quoteText,
}: {
  brandName: string;
  requestHref: string | null;
  cleanerHref: string;
  quoteLabel: string;
  quoteText?: string;
}) {
  const { t } = useTranslation();
  return (
    <section className="py-16 sm:py-20 bg-primary-600 text-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
        <h2 className="text-3xl font-bold mb-4">
          {t("sitePresentation.quoteHeading")}
        </h2>
        <p className="text-primary-100 mb-8 whitespace-pre-wrap text-lg">
          {quoteText ?? t("sitePresentation.quoteSupport", { brand: brandName })}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          {requestHref ? (
            <SiteLink
              href={requestHref}
              className="bg-white text-primary-700 px-8 py-3 rounded-lg font-semibold hover:bg-primary-50 transition-colors shadow-lg flex items-center gap-2"
            >
              <span>{quoteLabel}</span>
              <ArrowRight className="w-4 h-4" />
            </SiteLink>
          ) : (
            <span className="bg-white/30 text-white/70 px-8 py-3 rounded-lg font-semibold cursor-not-allowed flex items-center gap-2">
              <span>{quoteLabel}</span>
              <ArrowRight className="w-4 h-4" />
            </span>
          )}
          <SiteLink
            href={cleanerHref}
            className="px-6 py-3 rounded-lg font-medium border border-white/30 text-white hover:bg-white/10 transition-colors"
          >
            Join Our Team
          </SiteLink>
        </div>
        {!requestHref && (
          <p className="mt-3 text-xs text-primary-200">
            {t("sitePresentation.quoteUnavailable")}
          </p>
        )}
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────

function FooterSection({
  brandName,
  email,
  phone,
  serviceArea,
}: {
  brandName: string;
  email?: string | null;
  phone?: string | null;
  serviceArea: string;
}) {
  return (
    <footer className="bg-gray-900 text-gray-400 py-12 sm:pb-12 pb-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <h3 className="font-bold text-white text-lg mb-2">{brandName}</h3>
            <p className="text-sm">
              {serviceArea ? `Cleaning services in ${serviceArea}.` : "Cleaning services."}
            </p>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold text-white text-sm mb-2 uppercase tracking-wider">
              Contact
            </h4>
            <div className="space-y-2 text-sm">
              {email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-500" />
                  <SiteLink
                    href={`mailto:${email}`}
                    className="hover:text-white transition-colors"
                  >
                    {email}
                  </SiteLink>
                </div>
              )}
              {phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-500" />
                  <SiteLink
                    href={toTelHref(phone)}
                    className="hover:text-white transition-colors"
                  >
                    {phone}
                  </SiteLink>
                </div>
              )}
              {!email && !phone && (
                <p className="text-sm text-gray-500">
                  Use the request form to get in touch.
                </p>
              )}
            </div>
          </div>

          {/* Service area */}
          <div>
            <h4 className="font-semibold text-white text-sm mb-2 uppercase tracking-wider">
              Service Area
            </h4>
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="w-4 h-4 text-gray-500" />
              {serviceArea}
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-8 pt-6 text-center text-xs text-gray-500">
          &copy; {new Date().getFullYear()} {brandName}. All rights reserved.
          Powered by SCRUB.
        </div>
      </div>
    </footer>
  );
}
