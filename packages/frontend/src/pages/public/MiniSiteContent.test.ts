import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { publicMiniSiteSections } from "../../../../../convex/lib/miniSiteSections";
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
