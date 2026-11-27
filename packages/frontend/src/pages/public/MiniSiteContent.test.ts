import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { publicMiniSiteSections } from "../../../../../convex/lib/miniSiteSections";
import { publicMiniSitePresentation, type MiniSitePresentation } from "../../../../../convex/lib/miniSitePresentation";
import { renderMiniSiteHtml } from "../../../api/_miniSiteHtml";
import { MiniSiteContent } from "./PublicSitePage";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: "en-US" } }),
}));

const site = {
  slug: "bright-homes",
  templateId: "B" as const,
  brandName: "Bright Homes",
  bio: "Local cleaners.",
  serviceArea: "Tampa",
  additionalServiceAreas: [],
  services: ["Deep cleaning"],
  publicPhone: "555-555-0100",
  publicEmail: "hi@example.test",
  logoUrl: null,
  heroImageUrl: null,
  metaDescription: null,
  publicRequestToken: "test-request",
};

const sections = publicMiniSiteSections([
  { id: "faq", enabled: true, heading: "Before your visit", entries: [
    { id: "faq-one", enabled: true, title: "What should I expect?", body: "Literal <script> and $&." },
    { id: "faq-two", enabled: false, title: "Hidden question", body: "Hidden answer" },
  ] },
  { id: "howItWorks", enabled: true, heading: "Our process", entries: [
    { id: "step-one", enabled: true, title: "Tell us what you need", body: "Send us your requirements." },
    { id: "step-two", enabled: false, title: "Hidden step", body: "Hidden answer" },
    { id: "step-three", enabled: true, title: "Review your quote", body: "We will talk it through." },
  ] },
  { id: "highlights", enabled: true, entries: [] },
]);

const render = (preview = false) => renderToStaticMarkup(createElement(MiniSiteContent, {
  site, slug: site.slug, publicRequestToken: site.publicRequestToken, sections, reviews: [], addOns: [], preview,
}));

describe("microsite public content and preview", () => {
  it("renders saved section order, native FAQ disclosures, and contiguous process numbers", () => {
    const html = render();
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain("Literal &lt;script&gt; and $&amp;.");
    expect(html.indexOf("Before your visit")).toBeLessThan(html.indexOf("Our process"));
    expect(html).toMatch(/aria-hidden="true">1<\/span>[\s\S]*Tell us what you need[\s\S]*aria-hidden="true">2<\/span>[\s\S]*Review your quote/);
    expect(html).not.toMatch(/Hidden question|Hidden step|publicSite\.sections\.(highlights|reviews|addOns)/);
    expect(html).toContain('href="/r/test-request?service=Deep%20cleaning"');
    expect(html).toContain('href="/bright-homes/cleaner"');
  });

  it("keeps preview content interactive without emitting navigation targets", () => {
    const html = render(true);
    expect(html).toContain("Before your visit");
    expect(html).toContain("<summary");
    expect(html).toContain('role="link" aria-disabled="true"');
    expect(html).not.toMatch(/\shref=|<form|test-request/);
  });

  it("escapes custom content in initial HTML and uses the same section order", () => {
    const template = '<html><head></head><body><div id="root"></div></body></html>';
    const html = renderMiniSiteHtml(template, { ...site, sections });
    expect(html).toContain("<summary>What should I expect?</summary>");
    expect(html).toContain("Literal &lt;script&gt; and $&amp;.");
    expect(html.indexOf("Before your visit")).toBeLessThan(html.indexOf("Our process"));
    expect(html).not.toMatch(/Hidden question|Hidden step|Why choose us/);
  });
});

describe("microsite business presentation", () => {
  const settings = [
    { id: "businessHours", enabled: true, heading: "Office hours" },
    { id: "socialProfiles", enabled: true },
    { id: "policies", enabled: true, entries: [
      { id: "access", enabled: true, title: "Access", body: "Use the side door <only>." },
      { id: "private", enabled: false, title: "Hidden policy", body: "Private terms" },
    ] },
  ];
  const brand: MiniSitePresentation = {
    serviceDetails: [{ index: 0, name: "Deep cleaning", description: "Care for <wood>.", included: "Counters", excluded: "Attic" }],
    hours: [{ day: "monday", status: "open", opens: "09:00", closes: "17:00" }, { day: "sunday", status: "appointment" }],
    socials: [{ platform: "instagram", url: "https://www.instagram.com/bright.homes/" }],
    externalReviewsEnabled: true,
    externalReviews: [{ platform: "yelp", url: "https://www.yelp.com/biz/bright-homes" }],
    quote: { label: "Ask for an estimate", text: "Tell us about your <space>." },
  };
  const brandedSite = { ...site, presentation: publicMiniSitePresentation(brand, site.services, settings) };
  const ordered = publicMiniSiteSections(settings);

  it("renders the new content and keeps the quote and service handoff destinations", () => {
    const html = renderToStaticMarkup(createElement(MiniSiteContent, {
      site: brandedSite, slug: site.slug, publicRequestToken: site.publicRequestToken, sections: ordered, reviews: [], addOns: [],
    }));
    expect(html).toContain('href="/r/test-request?service=Deep%20cleaning"');
    expect(html).toContain('href="/r/test-request"');
    expect(html).toContain("Ask for an estimate");
    expect(html).toContain("Tell us about your &lt;space&gt;.");
    expect(html).toContain("Care for &lt;wood&gt;.");
    expect(html).toContain('dateTime="09:00"');
    expect(html).toContain("Office hours");
    expect(html).toContain("sitePresentation.status.appointment");
    expect(html).toContain("Use the side door &lt;only&gt;.");
    expect(html).toContain('href="https://www.instagram.com/bright.homes/"');
    expect(html).toContain('href="https://www.yelp.com/biz/bright-homes"');
    expect(html).not.toMatch(/Hidden policy|Private terms|average from|NaN/);
  });

  it("renders unsaved content with inert quote, application and external profile links", () => {
    const html = renderToStaticMarkup(createElement(MiniSiteContent, {
      site: brandedSite, slug: site.slug, publicRequestToken: site.publicRequestToken, sections: ordered, reviews: [], addOns: [], preview: true,
    }));
    expect(html).toContain("Ask for an estimate");
    expect(html).toContain("Care for &lt;wood&gt;.");
    expect(html).toContain('aria-label="sitePresentation.viewReviews" aria-disabled="true"');
    expect(html).not.toMatch(/\shref=|test-request|www\.yelp|www\.instagram/);
  });

  it("uses escaped public text and visible profiles in initial HTML", () => {
    const template = '<html><head></head><body><div id="root"></div></body></html>';
    const html = renderMiniSiteHtml(template, { ...brandedSite, sections: ordered });
    expect(html).toContain('href="/r/test-request">Ask for an estimate');
    expect(html).toContain("Care for &lt;wood&gt;.");
    expect(html).toContain("Use the side door &lt;only&gt;.");
    expect(html).toContain('datetime="09:00"');
    expect(html).toContain("View reviews on Yelp");
    expect(html).not.toMatch(/Hidden policy|Private terms|<wood>/);
    const hidden = [{ id: "services", enabled: false }, { id: "reviews", enabled: false }];
    const hiddenHtml = renderMiniSiteHtml(template, {
      ...site, sections: publicMiniSiteSections(hidden), presentation: publicMiniSitePresentation(brand, site.services, hidden),
    });
    expect(hiddenHtml).not.toMatch(/Care for|Office hours|side door|instagram.com|yelp.com/);
  });
});
