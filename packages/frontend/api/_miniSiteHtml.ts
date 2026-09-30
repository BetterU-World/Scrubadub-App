import { miniSiteCanonical, miniSiteDescription, miniSiteTitle, safePublicImage, type MiniSiteFacts } from "./_miniSiteRuntime";

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const scrubImage = "https://scrubscrubscrub.com/scrub-social-preview.png";

export function renderMiniSiteHtml(template: string, site: MiniSiteFacts) {
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
  const content = `<main style="font-family:system-ui,sans-serif;max-width:64rem;margin:auto;padding:2rem"><h1>${escapeHtml(site.brandName)}</h1>${site.bio ? `<p>${escapeHtml(site.bio)}</p>` : ""}${areas.length ? `<section><h2>Service area</h2><p>${areas.map(escapeHtml).join(", ")}</p></section>` : ""}${site.services.length ? `<section><h2>Our services</h2><ul>${site.services.map(service => `<li>${escapeHtml(service)}</li>`).join("")}</ul></section>` : ""}${site.publicPhone || site.publicEmail ? `<section><h2>Contact</h2>${site.publicPhone ? `<p>${escapeHtml(site.publicPhone)}</p>` : ""}${site.publicEmail ? `<p>${escapeHtml(site.publicEmail)}</p>` : ""}</section>` : ""}</main>`;
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
    .replace("</head>", `    ${tags}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${content}</div>`);
}
