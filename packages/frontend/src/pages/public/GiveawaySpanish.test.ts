import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";
import es from "../../i18n/es/common.json";
import en from "../../i18n/en/common.json";
import { GiveawayPage } from "./GiveawayPage";
import { GiveawayAssessmentContact } from "./GiveawayAssessmentContact";
import { giveawayTwo, giveawayTwoId } from "../../../../../convex/lib/giveawayCampaignTwo";

vi.mock("convex/react", () => ({ useMutation: () => async () => ({ status: "received" }) }));
const original = { ...giveawayTwo };
afterEach(() => { Object.assign(giveawayTwo, original); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Giveaway #2 Spanish presentation", () => {
  it("translates entry fields and material summary while identifying the English official rules", async () => {
    const i18n = createInstance();
    await i18n.init({ lng: "es", fallbackLng: "en", resources: { es: { translation: es }, en: { translation: en } } });
    Object.assign(giveawayTwo, { startsAt: Date.parse("2026-11-12T09:00:00-05:00"), enabled: true, rulesApproved: true });
    vi.stubGlobal("window", { location: { search: `?campaign=${giveawayTwoId}` } });
    vi.spyOn(Date, "now").mockReturnValue(giveawayTwo.startsAt!);
    const html = renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(GiveawayPage)));
    expect(html).toContain("Información del sorteo en español");
    expect(html).toContain("Reglas Oficiales (en inglés)");
    expect(html).toContain("seis meses gratis");
    expect(html).toContain("de 18 años o más");
    expect(html).toContain("$949.94");
    expect(html).toContain("Enviar participación alternativa gratuita");
    expect(html).toContain("Correo de contacto");
    expect(html).not.toContain("giveawayLaunch.");
    const fields = html.match(/<input type="checkbox"[^>]*>/g)!;
    expect(fields).toHaveLength(3);
    expect(fields[0]).toContain("required"); expect(fields[1]).toContain("required");
    expect(fields[2]).not.toContain("required"); expect(fields.join()).not.toContain("checked");
    expect(html).not.toMatch(/type="(?:password|tel|file)"/);
    const contact = renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(GiveawayAssessmentContact,
      { campaignId: giveawayTwoId, busy: false, error: "", onComplete: () => {}, onBack: () => {} })));
    expect(contact).toContain("Reglas Oficiales (en inglés)");
    expect(contact).toContain("sin cuenta SCRUB");
    expect(contact).toContain("Rhode Island");
    expect(contact).toContain("15 de diciembre");
  });
});
