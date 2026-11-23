// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import en from "../../i18n/en/common.json";
import es from "../../i18n/es/common.json";
import { SmartEstimateFields } from "./SmartEstimateFields";

const language = vi.hoisted(() => ({ current: "en" }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({
  i18n: { language: language.current },
  t: (key: string, args?: Record<string, string>) => {
    const label = key.split(".").reduce<any>((obj, part) => obj?.[part], language.current === "en" ? en : es);
    return typeof label === "string" ? label.replace(/\{\{(\w+)\}\}/g, (_, name) => args?.[name] ?? "") : key;
  },
}) }));

describe("Smart Estimate property facts", () => {
  it.each([["en", en], ["es", es]] as const)("shows the saved quote area and enables a walkthrough-only choice in %s", async (locale, labels) => {
    language.current = locale;
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const element = document.createElement("div");
    const root = createRoot(element);
    const onChange = vi.fn();
    const input = { strategy: "square_feet", cadence: "one_time", areaHundredths: 85000 } as const;
    try {
      await act(async () => root.render(createElement(SmartEstimateFields, { input, onChange,
        facts: { areaHundredths: { value: 120000, source: "property", alternative: { value: 90000, source: "walkthrough" } } },
      })));
      expect(element.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe("850");
      expect(element.textContent).toContain(labels.smartEstimates.sources.property);
      expect(element.textContent).toContain(labels.smartEstimates.areaHelp);
      expect(element.textContent).toContain(labels.smartEstimates.quoteFactDiffers);
      const useObservation = element.querySelector("button")!;
      expect(useObservation.textContent).toBe(labels.smartEstimates.useWalkthroughFact.replace("{{value}}", "900"));
      expect(useObservation.className).toContain("w-full");
      expect(onChange).not.toHaveBeenCalled();
      await act(async () => useObservation.click());
      expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...input, areaHundredths: 90000 });
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
  });
});
