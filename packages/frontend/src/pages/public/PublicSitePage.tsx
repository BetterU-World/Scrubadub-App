import { useEffect } from "react";
import { useParams } from "wouter";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { MapPin, Mail, Phone, CheckCircle } from "lucide-react";

// ── SEO helper ────────────────────────────────────────────────────────

function usePageMeta(meta: {
  title: string;
  description: string;
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
      { property: "og:type", content: meta.ogType ?? "website" },
    ];

    const created: HTMLMetaElement[] = [];
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
      }
      el.setAttribute("content", tag.content);
    }

    return () => {
      document.title = prev;
      created.forEach((el) => el.remove());
    };
  }, [meta?.title, meta?.description, meta?.ogType]);
}

// ── Page component ───────────────────────────────────────────────────

export function PublicSitePage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "";

  const site = useQuery(
    api.queries.companySites.getBySlug,
    slug ? { slug } : "skip"
  );

  // Set SEO tags when site data loads
  usePageMeta(
    site
      ? {
          title: `${site.brandName} | Scrubadub`,
          description:
            site.metaDescription ||
            `Professional cleaning services in ${site.serviceArea}`,
        }
      : null
  );

  if (site === undefined) {
    return (
      <Shell>
        <div className="flex justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      </Shell>
    );
  }

  if (site === null) {
    return (
      <Shell>
        <div className="text-center py-20">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Page not found
          </h2>
          <p className="text-gray-500">
            This site doesn't exist or has been removed.
          </p>
        </div>
      </Shell>
    );
  }

  const requestHref = site.publicRequestToken
    ? `/r/${site.publicRequestToken}`
    : null;
  const cleanerHref = `/${slug}/cleaner`;

  if (site.templateId === "B") {
    return <TemplateB site={site} requestHref={requestHref} cleanerHref={cleanerHref} />;
  }

  return <TemplateA site={site} requestHref={requestHref} cleanerHref={cleanerHref} />;
}

// ── Shared types ──────────────────────────────────────────────────────

interface SiteData {
  brandName: string;
  bio: string;
  serviceArea: string;
  logoUrl?: string | null;
  heroImageUrl?: string | null;
  services: string[];
  publicEmail?: string | null;
  publicPhone?: string | null;
}

interface TemplateProps {
  site: SiteData;
  requestHref: string | null;
  cleanerHref: string;
}

// ── Shared sections ──────────────────────────────────────────────────

function ServicesSection({ services }: { services: string[] }) {
  if (services.length === 0) return null;
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-3">
        Our Services
      </h2>
      <ul className="space-y-2">
        {services.map((svc, i) => (
          <li key={i} className="flex items-start gap-2 text-gray-700">
            <CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />
            {svc}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContactSection({
  email,
  phone,
}: {
  email?: string | null;
  phone?: string | null;
}) {
  if (!email && !phone) return null;
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Contact</h2>
      <div className="space-y-2 text-sm">
        {email && (
          <div className="flex items-center gap-2 text-gray-600">
            <Mail className="w-4 h-4 text-gray-400" />
            <a
              href={`mailto:${email}`}
              className="text-primary-600 hover:underline"
            >
              {email}
            </a>
          </div>
        )}
        {phone && (
          <div className="flex items-center gap-2 text-gray-600">
            <Phone className="w-4 h-4 text-gray-400" />
            <a
              href={`tel:${phone}`}
              className="text-primary-600 hover:underline"
            >
              {phone}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Template A: Clean & Minimal ───────────────────────────────────────

function TemplateA({ site, requestHref, cleanerHref }: TemplateProps) {
  return (
    <Shell>
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          {site.logoUrl ? (
            <img
              src={site.logoUrl}
              alt={site.brandName}
              className="h-16 w-auto mx-auto mb-4 object-contain"
            />
          ) : (
            <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-primary-100 flex items-center justify-center">
              <span className="text-2xl font-bold text-primary-700">
                {site.brandName.charAt(0)}
              </span>
            </div>
          )}
          <h1 className="text-3xl font-bold text-gray-900">
            {site.brandName}
          </h1>
          <p className="mt-2 flex items-center justify-center gap-1.5 text-gray-500">
            <MapPin className="w-4 h-4" />
            {site.serviceArea}
          </p>
        </div>

        {/* Bio */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <p className="text-gray-700 whitespace-pre-line">{site.bio}</p>
        </div>

        {/* Services */}
        <ServicesSection services={site.services} />

        {/* Contact */}
        <ContactSection email={site.publicEmail} phone={site.publicPhone} />

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-3">
          {requestHref && (
            <a
              href={requestHref}
              className="btn-primary flex-1 text-center py-3"
            >
              Request Service
            </a>
          )}
          <a
            href={cleanerHref}
            className="btn-secondary flex-1 text-center py-3"
          >
            Work With Us
          </a>
        </div>
      </div>
    </Shell>
  );
}

// ── Template B: Bold with hero ────────────────────────────────────────

function TemplateB({ site, requestHref, cleanerHref }: TemplateProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div
        className="relative bg-gray-800 text-white"
        style={
          site.heroImageUrl
            ? {
                backgroundImage: `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url(${site.heroImageUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          {site.logoUrl && (
            <img
              src={site.logoUrl}
              alt={site.brandName}
              className="h-14 w-auto mx-auto mb-4 object-contain"
            />
          )}
          <h1 className="text-4xl font-bold">{site.brandName}</h1>
          <p className="mt-3 text-lg text-gray-200 flex items-center justify-center gap-1.5">
            <MapPin className="w-5 h-5" />
            {site.serviceArea}
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-2xl mx-auto px-4 -mt-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            About Us
          </h2>
          <p className="text-gray-700 whitespace-pre-line">{site.bio}</p>
        </div>

        {/* Services */}
        <ServicesSection services={site.services} />

        {/* Contact */}
        <ContactSection email={site.publicEmail} phone={site.publicPhone} />

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 pb-12">
          {requestHref && (
            <a
              href={requestHref}
              className="btn-primary flex-1 text-center py-3"
            >
              Request Service
            </a>
          )}
          <a
            href={cleanerHref}
            className="btn-secondary flex-1 text-center py-3"
          >
            Work With Us
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-gray-50">{children}</div>;
}
