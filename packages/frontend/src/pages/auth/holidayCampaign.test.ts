// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../i18n";
import { getHolidayPhase } from "./holidayCampaign";
import { LandingPage } from "./LandingPage";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));

const page = () => createElement(LandingPage);

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await i18n.changeLanguage("en");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("holiday campaign", () => {
  it.each([
    ["2026-11-20T12:00:00-05:00", "blackFriday"],
    ["2026-12-01T04:59:59.999Z", "blackFriday"],
    ["2026-12-01T05:00:00.000Z", "holiday"],
    ["2027-01-01T04:59:59.999Z", "holiday"],
    ["2027-01-01T05:00:00.000Z", "newYear"],
    ["2027-01-18T04:59:59.999Z", "newYear"],
    ["2027-01-18T05:00:00.000Z", undefined],
  ])("selects the Eastern phase at %s", (time, phase) => {
    expect(getHolidayPhase(Date.parse(time))?.name).toBe(phase);
  });

  it("renders the offer and estimated prices without changing checkout links", () => {
    vi.setSystemTime(new Date("2026-11-28T12:00:00Z"));
    const html = renderToStaticMarkup(page());
    for (const price of ["$34.99", "$64.99", "$149.99", "$17.50", "$32.50", "$75.00"]) {
      expect(html).toContain(price);
    }
    for (const plan of ["solo", "team", "pro"]) {
      expect(html).toContain('href="/get-started?plan=' + plan + '"');
    }
    expect(html).toContain("Black Friday Sale");
    expect(html).toContain("50% off your first 3 months");
    expect(html).toContain("Regular monthly pricing resumes afterward.");
    expect(html).not.toContain("50OFF3");
  });

  it("restores ordinary pricing at public expiration", () => {
    vi.setSystemTime(new Date("2027-01-18T05:00:00Z"));
    const html = renderToStaticMarkup(page());
    for (const price of ["$34.99", "$64.99", "$149.99"]) expect(html).toContain(price);
    for (const promotion of ["SCRUBHOLIDAY", "50OFF3", "50% off", "$17.50", "$32.50", "$75.00"]) {
      expect(html).not.toContain(promotion);
    }
  });

  it("renders Spanish offer text and the current phase", async () => {
    await i18n.changeLanguage("es");
    vi.setSystemTime(new Date("2026-12-05T12:00:00Z"));
    const html = renderToStaticMarkup(page());
    expect(html).toContain("Oferta de fiestas");
    expect(html).toContain("50 % de descuento durante tus primeros 3 meses");
    expect(html).toContain("Copiar código promocional SCRUBHOLIDAY");
    expect(html).toContain("Después se aplica el precio mensual habitual.");
  });

  it("copies the code, handles clipboard failure, and refreshes on return to the page", async () => {
    vi.setSystemTime(new Date("2027-01-17T12:00:00Z"));
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Clipboard denied"));
    vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { clipboard: { writeText } }));
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () => root.render(page()));
      expect(container.textContent).toContain("New Year's Sale");

      const button = container.querySelector<HTMLButtonElement>('button[aria-label="Copy promotion code SCRUBHOLIDAY"]')!;
      await act(async () => button.click());
      expect(writeText).toHaveBeenCalledWith("SCRUBHOLIDAY");
      expect(container.querySelector("#pricing [role=status]")?.textContent).toBe("Promotion code copied.");

      await act(async () => button.click());
      expect(container.querySelector("#pricing [role=status]")?.textContent).toContain("Copy unavailable.");

      vi.setSystemTime(new Date("2027-01-18T05:00:00Z"));
      await act(async () => window.dispatchEvent(new Event("pageshow")));
      expect(container.querySelector("#pricing")?.textContent).not.toContain("SCRUBHOLIDAY");
    } finally {
      await act(async () => root.unmount());
    }
  });
});
