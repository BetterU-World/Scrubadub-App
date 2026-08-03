import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));

import { LandingPage } from "./LandingPage";

const renderPage = () => renderToStaticMarkup(createElement(LandingPage));

describe("SCRUB landing page messaging contracts", () => {
  it("defines one primary heading and the operating-system position", () => {
    const html = renderPage();

    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("The operating system for modern cleaning businesses.");
    expect(html).toContain("Everything your cleaning business needs. Nothing it doesn&#x27;t.");
  });

  it("represents the connected lifecycle and owner, client, and worker stories", () => {
    const html = renderPage();

    for (const label of ["Capture", "Scope", "Win", "Schedule", "Deliver", "Get paid", "Improve"]) {
      expect(html).toContain(`>${label}<`);
    }
    expect(html).toContain("For owners");
    expect(html).toContain("For clients");
    expect(html).toContain("For workers");
  });

  it("speaks to all three cleaning-business models", () => {
    const html = renderPage();

    expect(html).toContain("Residential &amp; maid service");
    expect(html).toContain("Commercial &amp; janitorial");
    expect(html).toContain("Short-term rental &amp; turnover");
  });

  it("removes the outdated video and provides clear primary and exploration CTAs", () => {
    const html = renderPage();

    expect(html).not.toContain("<video");
    expect(html).not.toContain("Scrub_Owner_Dashboard_User_Guide.mp4");
    expect(html).toContain('href="/get-started"');
    expect(html).toContain('href="#product-proof"');
  });

  it("preserves current prices and plan-specific checkout targets", () => {
    const html = renderPage();

    for (const price of ["$34.99", "$64.99", "$149.99"]) expect(html).toContain(price);
    for (const plan of ["solo", "team", "pro"]) expect(html).toContain(`href="/get-started?plan=${plan}"`);
  });

  it("uses semantic FAQ disclosures and includes complete footer legal links", () => {
    const html = renderPage();

    expect(html.match(/<details/g)?.length).toBeGreaterThanOrEqual(12);
    expect(html).toContain("Is SCRUB only scheduling software?");
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/contact"');
  });

  it("keeps compact navigation responsive and touch sized without fabricated proof", () => {
    const html = renderPage();

    expect(html).toContain("md:hidden");
    expect(html).toContain("hidden items-center gap-6 md:flex");
    expect(html).toContain("touch-target");
    expect(html).not.toMatch(/testimonial|trusted by|customers served|jobs completed/i);
  });

  it("uses authentic static product proof without exposing Showcase runtime routes", () => {
    const html = renderPage();

    expect(html).toContain("One job. Three connected experiences. One source of truth.");
    expect(html).toContain("product-proof-owner-dashboard-1200.avif");
    expect(html).toContain("product-proof-owner-jobs-1200.avif");
    expect(html).toContain("product-proof-worker-job-375.webp");
    expect(html).toContain("product-proof-client-request-timeline-753.avif");
    expect(html).toContain('fetchPriority="high"');
    expect(html).toContain('loading="lazy"');
    expect(html).not.toContain("/internal/demo/");
    expect(html).not.toContain("<iframe");
  });

  it("keeps the Assessment supporting the paid-product story", () => {
    const html = renderPage();
    const heroEnd = html.indexOf('aria-label="Product credibility"');

    expect(html.slice(0, heroEnd)).not.toContain("Operations Assessment");
    expect(html).toContain("Get your free Operations Assessment");
    expect(html).toContain("Operations Score");
    expect(html).toContain("Confidence Score");
    expect(html).toContain("Personalized roadmap");
  });
});
