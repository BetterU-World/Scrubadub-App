import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, type ReactNode } from "react";
import { JobCreationModeSelector } from "./JobCreationModeSelector";
import en from "../../i18n/en/common.json";
import es from "../../i18n/es/common.json";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement("a", { href, ...props }, children) }));

describe("Job creation mode selector", () => {
  it.each([
    ["standard", "/jobs/new", "/jobs/quick"],
    ["quick", "/jobs/quick", "/jobs/new"],
  ] as const)("marks %s active and the other choice neutral", (mode, activeHref, inactiveHref) => {
    const markup = renderToStaticMarkup(createElement(JobCreationModeSelector, { mode }));
    expect(markup).toContain(`href="${activeHref}"`);
    expect(markup).toContain(`href="${inactiveHref}"`);
    const active = markup.match(new RegExp(`<a[^>]*href="${activeHref}"[^>]*>`))?.[0];
    const inactive = markup.match(new RegExp(`<a[^>]*href="${inactiveHref}"[^>]*>`))?.[0];
    expect(active).toContain('aria-current="page"');
    expect(active).toContain("bg-primary-600");
    expect(inactive).toContain("bg-white");
    expect(inactive).not.toContain("aria-current");
  });

  it("has a localized Time label without a leaked key", () => {
    expect(en.quick.time).toBe("Time");
    expect(es.quick.time).toBe("Hora");
    expect(en.quick.time).not.toBe("jobForm.time");
  });
});
