import { miniSiteCanonical, miniSiteDescription, miniSiteTitle, safePublicImage, type MiniSiteFacts } from "./_miniSiteRuntime.js";
import type { PublicMiniSiteSections } from "../../../convex/lib/miniSiteSections";
import type { MiniSiteProfile, PublicMiniSitePresentation } from "../../../convex/lib/miniSitePresentation";

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const scrubImage = "https://scrubscrubscrub.com/scrub-social-preview.png";

const fallbackHeadings = {
  services: "Our services",
  serviceArea: "Service area",
  faq: "Frequently asked questions",
  highlights: "Why choose us",
  howItWorks: "How it works",
  addOns: "Optional add-ons",
  reviews: "What our clients say",
  businessHours: "Business hours",
  socialProfiles: "Social profiles",
  policies: "Service policies",
} satisfies Record<PublicMiniSiteSections[number]["id"], string>;

const profileNames = {
  facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", linkedin: "LinkedIn", youtube: "YouTube",
  google: "Google Maps", yelp: "Yelp", bbb: "Better Business Bureau", angi: "Angi", trustpilot: "Trustpilot",
} satisfies Record<MiniSiteProfile["platform"], string>;

function profileLinks(profiles: MiniSiteProfile[] | undefined, reviews: boolean) {
  const items = (profiles ?? []).flatMap(({ platform, url }) => {
    const safe = safePublicImage(url);
    const name = profileNames[platform];
    if (!safe || !name) return [];
    const label = reviews ? `View reviews on ${name}` : name;
    return [`<li><a href="${escapeHtml(safe)}" rel="noopener noreferrer">${escapeHtml(label)}</a></li>`];
  });
  return items.length ? `<ul>${items.join("")}</ul>` : "";
}

export function renderMiniSiteHtml(template: string, site: MiniSiteFacts & {
  sections?: PublicMiniSiteSections;
  presentation?: PublicMiniSitePresentation;
}) {
  const title = miniSiteTitle(site);
  const description = miniSiteDescription(site);
  const canonical = miniSiteCanonical(site.slug);
  const image = safePublicImage(site.heroImageUrl) ?? safePublicImage(site.logoUrl) ?? scrubImage;
  const areas = [site.serviceArea, ...site.additionalServiceAreas].filter(Boolean);
  const schema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${canonical}#business`,
    url: canonical,
    name: site.brandName,
    ...(site.bio ? { description: site.bio } : {}),
    ...(site.publicPhone ? { telephone: site.publicPhone } : {}),
    ...(site.publicEmail ? { email: site.publicEmail } : {}),
    ...(areas.length ? { areaServed: areas } : {}),
    ...(safePublicImage(site.logoUrl) ? { logo: site.logoUrl } : {}),
    ...(safePublicImage(site.heroImageUrl) ? { image: site.heroImageUrl } : {}),
    ...(site.services.length ? { hasOfferCatalog: { "@type": "OfferCatalog", name: "Services", itemListElement: site.services.map(name => ({ "@type": "Offer", itemOffered: { "@type": "Service", name } })) } } : {}),
  };
  const sections: PublicMiniSiteSections = site.sections ?? [{ id: "serviceArea" }, { id: "services" }];
  const presentation = site.presentation;
  const sectionsHtml = sections.map(({ id, heading, entries }) => {
    let body = "";
    if (id === "serviceArea" && areas.length) body = `<p>${areas.map(escapeHtml).join(", ")}</p>`;
    if (id === "services" && site.services.length) {
      body = `<ul>${site.services.map((service, index) => {
        const detail = presentation?.serviceDetails?.find((item) => item.index === index);
        if (!detail) return `<li>${escapeHtml(service)}</li>`;
        const description = detail.description ? `<p>${escapeHtml(detail.description)}</p>` : "";
        const included = detail.included ? `<h4>What's included</h4><p>${escapeHtml(detail.included)}</p>` : "";
        const excluded = detail.excluded ? `<h4>What's not included</h4><p>${escapeHtml(detail.excluded)}</p>` : "";
        return `<li><h3>${escapeHtml(service)}</h3>${description}${included}${excluded}</li>`;
      }).join("")}</ul>`;
    }
    if ((id === "faq" || id === "policies") && entries?.length) {
      body = entries.map(({ title, body }) => `<details><summary>${escapeHtml(title)}</summary><p>${escapeHtml(body)}</p></details>`).join("");
    }
    if (id === "businessHours" && presentation?.hours?.length) {
      body = `<p>Public business hours are shown in local time. Appointment times are confirmed separately.</p><dl>${presentation.hours.map((entry) => {
        const day = entry.day.charAt(0).toUpperCase() + entry.day.slice(1);
        const time = entry.status === "open"
          ? `<time datetime="${escapeHtml(entry.opens)}">${escapeHtml(entry.opens)}</time> – <time datetime="${escapeHtml(entry.closes)}">${escapeHtml(entry.closes)}</time>`
          : entry.status === "closed" ? "Closed" : "By appointment";
        return `<dt>${escapeHtml(day)}</dt><dd>${time}</dd>`;
      }).join("")}</dl>`;
    }
    if (id === "socialProfiles") body = profileLinks(presentation?.socials, false);
    if (id === "reviews") body = profileLinks(presentation?.externalReviews, true);
    if ((id === "highlights" || id === "howItWorks") && entries?.length) {
      const list = id === "howItWorks" ? "ol" : "ul";
      body = `<${list}>${entries.map(({ title, body }) => `<li><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></li>`).join("")}</${list}>`;
    }
    return body ? `<section><h2>${escapeHtml(heading || fallbackHeadings[id])}</h2>${body}</section>` : "";
  }).join("");
  const quoteText = presentation?.quote?.text ? `<p>${escapeHtml(presentation.quote.text)}</p>` : "";
  const quoteLink = site.publicRequestToken ? `<p><a href="/r/${escapeHtml(encodeURIComponent(site.publicRequestToken))}">${escapeHtml(presentation?.quote?.label ?? "Request a Quote")}</a></p>` : "";
  const content = `<main style="font-family:system-ui,sans-serif;max-width:64rem;margin:auto;padding:2rem"><h1>${escapeHtml(site.brandName)}</h1>${site.bio ? `<p>${escapeHtml(site.bio)}</p>` : ""}${sectionsHtml}${quoteText}${quoteLink}${site.publicPhone || site.publicEmail ? `<section><h2>Contact</h2>${site.publicPhone ? `<p>${escapeHtml(site.publicPhone)}</p>` : ""}${site.publicEmail ? `<p>${escapeHtml(site.publicEmail)}</p>` : ""}</section>` : ""}</main>`;
  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta property="og:image:alt" content="${escapeHtml(site.brandName)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    `<meta name="twitter:image:alt" content="${escapeHtml(site.brandName)}" />`,
    `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>`,
  ].join("\n    ");
  return template
    .replace(/<title>[^<]*<\/title>/, "")
    .replace(/\s*<meta (?:name|property)="(?:description|og:[^"]+|twitter:[^"]+)"[^>]*>/g, "")
    .replace(/\s*<link rel="canonical"[^>]*>/g, "")
    .replace("</head>", () => `    ${tags}\n  </head>`)
    .replace('<div id="root"></div>', () => `<div id="root">${content}</div>`);
}
