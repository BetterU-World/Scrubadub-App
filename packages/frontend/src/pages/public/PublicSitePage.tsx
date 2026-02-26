import { useEffect } from "react";
import { useParams } from "wouter";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  MapPin,
  Mail,
  Phone,
  PhoneCall,
  Star,
  Shield,
  Leaf,
  UserCheck,
  Sparkles,
  Home,
  Building2,
  Truck,
  HardHat,
  ClipboardCheck,
  CalendarCheck,
  ChevronDown,
  ArrowRight,
} from "lucide-react";

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

// ── Helpers ───────────────────────────────────────────────────────────

/** Strip non-digit chars for tel: links */
function toTelHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

// ── Types ─────────────────────────────────────────────────────────────

interface SiteData {
  templateId: string;
  brandName: string;
  bio: string;
  serviceArea: string;
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

  // Set SEO tags when site data loads
  usePageMeta(
    site
      ? {
          title: `${site.brandName} — Professional Cleaning Services`,
          description:
            site.metaDescription ||
            `Professional cleaning services in ${site.serviceArea}. Request a free quote today.`,
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

  const requestHref = site.publicRequestToken
    ? `/r/${site.publicRequestToken}`
    : null;
  const cleanerHref = `/${slug}/cleaner`;
  const isDark = site.templateId === "B";

  return (
    <div className={`min-h-screen ${isDark ? "bg-gray-950" : "bg-white"}`}>
      {/* ── Navigation bar ─────────────────────────────────────── */}
      <nav
        className={`sticky top-0 z-50 backdrop-blur-sm border-b ${
          isDark
            ? "bg-gray-950/95 border-gray-800"
            : "bg-white/95 border-gray-100"
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {site.logoUrl ? (
              <img
                src={site.logoUrl}
                alt={site.brandName}
                className="h-9 w-9 rounded-lg object-cover"
              />
            ) : (
              <div className="h-9 w-9 rounded-lg bg-primary-600 flex items-center justify-center">
                <span className="text-white font-bold text-sm">
                  {site.brandName.charAt(0)}
                </span>
              </div>
            )}
            <span
              className={`font-bold text-lg ${isDark ? "text-white" : "text-gray-900"}`}
            >
              {site.brandName}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {site.publicPhone && (
              <a
                href={toTelHref(site.publicPhone)}
                className={`hidden sm:flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
                  isDark
                    ? "text-gray-300 hover:text-white hover:bg-gray-800"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                }`}
              >
                <PhoneCall className="w-4 h-4" />
                Call / Text
              </a>
            )}
            <QuoteButton href={requestHref} size="sm" />
          </div>
        </div>
      </nav>

      {/* ── Hero section ───────────────────────────────────────── */}
      <HeroSection
        site={site}
        requestHref={requestHref}
        cleanerHref={cleanerHref}
        isDark={isDark}
      />

      {/* ── Trust badges ───────────────────────────────────────── */}
      <TrustBadgesSection isDark={isDark} />

      {/* ── Services ───────────────────────────────────────────── */}
      <ServicesSection
        services={site.services}
        requestHref={requestHref}
        isDark={isDark}
      />

      {/* ── How it works ───────────────────────────────────────── */}
      <HowItWorksSection isDark={isDark} />

      {/* ── Service area ───────────────────────────────────────── */}
      <ServiceAreaSection serviceArea={site.serviceArea} isDark={isDark} />

      {/* ── Reviews ────────────────────────────────────────────── */}
      <ReviewsSection reviews={reviews ?? []} isDark={isDark} />

      {/* ── FAQ ────────────────────────────────────────────────── */}
      <FAQSection isDark={isDark} />

      {/* ── Final CTA ──────────────────────────────────────────── */}
      <CTASection
        brandName={site.brandName}
        requestHref={requestHref}
        cleanerHref={cleanerHref}
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
        className={`sm:hidden fixed bottom-0 left-0 right-0 z-50 border-t p-3 ${
          isDark ? "bg-gray-950 border-gray-800" : "bg-white border-gray-200"
        }`}
      >
        <div className="flex gap-2">
          {site.publicPhone && (
            <a
              href={toTelHref(site.publicPhone)}
              className={`flex items-center justify-center gap-1.5 py-3 px-4 rounded-lg font-medium text-sm border transition-colors ${
                isDark
                  ? "border-gray-700 text-gray-200 hover:bg-gray-800"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <PhoneCall className="w-4 h-4" />
              Call
            </a>
          )}
          {requestHref ? (
            <a
              href={requestHref}
              className="btn-primary flex-1 text-center py-3 block font-semibold"
            >
              Request a Free Quote
            </a>
          ) : (
            <span className="flex-1 text-center py-3 block font-semibold rounded-lg bg-gray-300 text-gray-500 cursor-not-allowed text-sm">
              Booking link not configured yet
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Shared: Quote button (handles null href) ─────────────────────────

function QuoteButton({
  href,
  size = "md",
  className = "",
}: {
  href: string | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const sizeClasses = size === "sm" ? "text-sm py-2 px-4" : "text-base px-8 py-3";

  if (href) {
    return (
      <a
        href={href}
        className={`btn-primary ${sizeClasses} ${className}`}
      >
        Get a Quote
      </a>
    );
  }

  return (
    <span
      className={`inline-block rounded-lg font-medium bg-gray-300 text-gray-500 cursor-not-allowed ${sizeClasses} ${className}`}
      title="Booking link not configured yet"
    >
      Get a Quote
    </span>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────

function HeroSection({
  site,
  requestHref,
  cleanerHref,
  isDark,
}: {
  site: SiteData;
  requestHref: string | null;
  cleanerHref: string;
  isDark: boolean;
}) {
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
        <p
          className={`text-lg sm:text-xl max-w-2xl mx-auto mb-2 ${
            useLightOnDark ? "text-gray-200" : "text-gray-600"
          }`}
        >
          {site.bio || "Professional cleaning services you can trust."}
        </p>
        <p
          className={`flex items-center justify-center gap-1.5 mb-8 text-sm ${
            useLightOnDark ? "text-gray-300" : "text-gray-500"
          }`}
        >
          <MapPin className="w-4 h-4" />
          Serving {site.serviceArea}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          {requestHref ? (
            <a
              href={requestHref}
              className="btn-primary text-base px-8 py-3 shadow-lg hover:shadow-xl transition-shadow flex items-center gap-2"
            >
              Request a Quote
              <ArrowRight className="w-4 h-4" />
            </a>
          ) : (
            <span className="inline-flex items-center gap-2 px-8 py-3 rounded-lg font-medium text-base bg-gray-400 text-gray-200 cursor-not-allowed">
              Request a Quote
              <ArrowRight className="w-4 h-4" />
            </span>
          )}
          <a
            href={cleanerHref}
            className={`px-6 py-3 rounded-lg font-medium text-base transition-colors ${
              useLightOnDark
                ? "bg-white/15 text-white hover:bg-white/25 border border-white/30"
                : "btn-secondary"
            }`}
          >
            Join Our Team
          </a>
        </div>
        {!requestHref && (
          <p className="mt-3 text-xs text-gray-400">
            Booking link not configured yet.
          </p>
        )}
      </div>
    </section>
  );
}

// ── Trust badges ──────────────────────────────────────────────────────

function TrustBadgesSection({ isDark }: { isDark: boolean }) {
  const badges = [
    { icon: Shield, label: "Fully Insured" },
    { icon: Leaf, label: "Eco-Friendly Products" },
    { icon: UserCheck, label: "Background-Checked" },
  ];

  return (
    <section
      className={`border-b ${
        isDark
          ? "bg-gray-900/50 border-gray-800"
          : "bg-gray-50/50 border-gray-100"
      }`}
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10">
          {badges.map((b) => (
            <div
              key={b.label}
              className={`flex items-center gap-2 text-sm ${
                isDark ? "text-gray-300" : "text-gray-600"
              }`}
            >
              <b.icon className="w-5 h-5 text-primary-500" />
              <span className="font-medium">{b.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Services ──────────────────────────────────────────────────────────

const DEFAULT_SERVICES = [
  { name: "Standard Clean", desc: "Regular cleaning to keep your space fresh and tidy.", icon: Sparkles },
  { name: "Deep Clean", desc: "Thorough top-to-bottom cleaning for a spotless home.", icon: Home },
  { name: "Move-In / Move-Out", desc: "Get your property move-ready with a complete clean.", icon: Truck },
  { name: "Airbnb Turnover", desc: "Fast, reliable turnovers for your short-term rental.", icon: Building2 },
  { name: "Post-Construction", desc: "Remove dust and debris after renovations or builds.", icon: HardHat },
  { name: "Office Cleaning", desc: "Professional cleaning for workspaces of all sizes.", icon: ClipboardCheck },
];

function ServicesSection({
  services,
  requestHref,
  isDark,
}: {
  services: string[];
  requestHref: string | null;
  isDark: boolean;
}) {
  const cards =
    services.length > 0
      ? services.slice(0, 6).map((svc, i) => ({
          name: svc,
          desc: "Professional service tailored to your needs.",
          icon: DEFAULT_SERVICES[i % DEFAULT_SERVICES.length].icon,
        }))
      : DEFAULT_SERVICES;

  return (
    <section className={`py-16 sm:py-20 ${isDark ? "bg-gray-950" : ""}`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <h2
            className={`text-3xl font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}
          >
            Our Services
          </h2>
          <p className={isDark ? "text-gray-400" : "text-gray-500"}>
            From routine cleaning to specialized deep cleans, we have you
            covered.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {cards.map((card) => (
            <div
              key={card.name}
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
              <p
                className={`text-sm mb-3 ${isDark ? "text-gray-400" : "text-gray-500"}`}
              >
                {card.desc}
              </p>
              {requestHref && (
                <a
                  href={requestHref}
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary-500 hover:text-primary-400"
                >
                  Request quote <ArrowRight className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── How it works ──────────────────────────────────────────────────────

function HowItWorksSection({ isDark }: { isDark: boolean }) {
  const steps = [
    {
      num: "1",
      title: "Request a Quote",
      desc: "Fill out a quick form with your address, preferred date, and any special instructions.",
    },
    {
      num: "2",
      title: "We Confirm",
      desc: "Our team reviews your request and confirms the date, time, and pricing.",
    },
    {
      num: "3",
      title: "We Clean",
      desc: "Our professional cleaners arrive on time and leave your space sparkling.",
    },
  ];

  return (
    <section
      className={`py-16 sm:py-20 ${isDark ? "bg-gray-900" : "bg-gray-50"}`}
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <h2
            className={`text-3xl font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}
          >
            How It Works
          </h2>
          <p className={isDark ? "text-gray-400" : "text-gray-500"}>
            Getting started is simple — three easy steps.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {steps.map((step) => (
            <div key={step.num} className="text-center">
              <div className="w-14 h-14 rounded-full bg-primary-600 text-white flex items-center justify-center mx-auto mb-4 text-lg font-bold">
                {step.num}
              </div>
              <h3
                className={`font-semibold mb-2 ${isDark ? "text-white" : "text-gray-900"}`}
              >
                {step.title}
              </h3>
              <p
                className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}
              >
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Service area ──────────────────────────────────────────────────────

function ServiceAreaSection({
  serviceArea,
  isDark,
}: {
  serviceArea: string;
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
          Service Area
        </h2>
        <p className={`text-lg ${isDark ? "text-gray-300" : "text-gray-600"}`}>
          Proudly serving{" "}
          <span className="font-semibold">{serviceArea}</span> and surrounding
          areas.
        </p>
      </div>
    </section>
  );
}

// ── Reviews ───────────────────────────────────────────────────────────

function ReviewsSection({
  reviews,
  isDark,
}: {
  reviews: ReviewData[];
  isDark: boolean;
}) {
  const avgRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

  return (
    <section
      className={`py-16 sm:py-20 ${isDark ? "bg-gray-900" : "bg-gray-50"}`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <h2
            className={`text-3xl font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}
          >
            What Our Clients Say
          </h2>
          {reviews.length > 0 ? (
            <div className="flex items-center justify-center gap-2">
              <StarRating rating={Math.round(avgRating)} />
              <span
                className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}
              >
                {avgRating.toFixed(1)} average from {reviews.length} review
                {reviews.length !== 1 ? "s" : ""}
              </span>
            </div>
          ) : (
            <p className={isDark ? "text-gray-400" : "text-gray-500"}>
              New reviews coming soon. We&rsquo;re collecting feedback from our
              clients.
            </p>
          )}
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

// ── FAQ ───────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: "How do I request a cleaning?",
    a: "Click \"Request a Quote\" and fill out a short form with your address, preferred date, and any special instructions. We'll get back to you with a confirmation.",
  },
  {
    q: "Do I need to be home during the cleaning?",
    a: "Not necessarily. You can leave access instructions (gate codes, lockbox, etc.) when you submit your request, and our team will handle the rest.",
  },
  {
    q: "What cleaning products do you use?",
    a: "We use professional-grade, eco-friendly products that are safe for kids, pets, and your surfaces. Let us know if you have any sensitivities.",
  },
  {
    q: "How much does a cleaning cost?",
    a: "Pricing depends on property size, condition, and the type of service. Request a quote and we'll send you a transparent estimate — no hidden fees.",
  },
  {
    q: "Can I leave special instructions?",
    a: "Absolutely. When you submit a request, there's a space for special instructions like entry codes, focus areas, or things to avoid.",
  },
  {
    q: "What if I'm not satisfied with the cleaning?",
    a: "Your satisfaction matters. After service, you'll receive a feedback link where you can rate and review. If something's off, we'll make it right.",
  },
];

function FAQSection({ isDark }: { isDark: boolean }) {
  return (
    <section className={`py-16 sm:py-20 ${isDark ? "bg-gray-950" : ""}`}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <h2
            className={`text-3xl font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}
          >
            Frequently Asked Questions
          </h2>
        </div>

        <div className="space-y-4">
          {FAQ_ITEMS.map((item, i) => (
            <FAQItem
              key={i}
              question={item.q}
              answer={item.a}
              isDark={isDark}
            />
          ))}
        </div>
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
          className={`font-medium ${isDark ? "text-gray-100" : "text-gray-900"}`}
        >
          {question}
        </span>
        <ChevronDown
          className={`w-5 h-5 shrink-0 ml-4 group-open:rotate-180 transition-transform ${
            isDark ? "text-gray-500" : "text-gray-400"
          }`}
        />
      </summary>
      <div
        className={`px-6 pb-4 text-sm leading-relaxed ${
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
}: {
  brandName: string;
  requestHref: string | null;
  cleanerHref: string;
}) {
  return (
    <section className="py-16 sm:py-20 bg-primary-600 text-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
        <h2 className="text-3xl font-bold mb-4">
          Ready for a cleaner space?
        </h2>
        <p className="text-primary-100 mb-8 text-lg">
          Let {brandName} take care of the cleaning so you can focus on what
          matters.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          {requestHref ? (
            <a
              href={requestHref}
              className="bg-white text-primary-700 px-8 py-3 rounded-lg font-semibold hover:bg-primary-50 transition-colors shadow-lg flex items-center gap-2"
            >
              Request a Free Quote
              <ArrowRight className="w-4 h-4" />
            </a>
          ) : (
            <span className="bg-white/30 text-white/70 px-8 py-3 rounded-lg font-semibold cursor-not-allowed flex items-center gap-2">
              Request a Free Quote
              <ArrowRight className="w-4 h-4" />
            </span>
          )}
          <a
            href={cleanerHref}
            className="px-6 py-3 rounded-lg font-medium border border-white/30 text-white hover:bg-white/10 transition-colors"
          >
            Join Our Team
          </a>
        </div>
        {!requestHref && (
          <p className="mt-3 text-xs text-primary-200">
            Booking link not configured yet.
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
              Professional cleaning services in {serviceArea}.
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
                  <a
                    href={`mailto:${email}`}
                    className="hover:text-white transition-colors"
                  >
                    {email}
                  </a>
                </div>
              )}
              {phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-500" />
                  <a
                    href={toTelHref(phone)}
                    className="hover:text-white transition-colors"
                  >
                    {phone}
                  </a>
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
          Powered by ScrubaDub.
        </div>
      </div>
    </footer>
  );
}
