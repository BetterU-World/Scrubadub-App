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
  it("keeps Spanish entry fields and the language switcher without the redundant summary", async () => {
    const i18n = createInstance();
    await i18n.init({ lng: "es", fallbackLng: "en", resources: { es: { translation: es }, en: { translation: en } } });
    Object.assign(giveawayTwo, { startsAt: Date.parse("2026-11-12T09:00:00-05:00"), enabled: true, rulesApproved: true });
    vi.stubGlobal("window", { location: { search: `?campaign=${giveawayTwoId}` } });
    vi.spyOn(Date, "now").mockReturnValue(giveawayTwo.startsAt!);
    const html = renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(GiveawayPage)));
    expect(html).not.toContain("Información del sorteo en español");
    expect(html).not.toContain("<details");
    expect(html).toContain(">EN</button>");
    expect(html).toContain(">ES</button>");
    expect(html).toContain("Reglas Oficiales (en inglés)");
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
  it.each(["en", "es"])("shows optional social links only for Giveaway #2 in %s", async language => {
    const i18n = createInstance();
    await i18n.init({ lng: language, fallbackLng: "en", resources: { es: { translation: es }, en: { translation: en } } });
    vi.stubGlobal("window", { location: { search: "" } });
    const render = () => renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(GiveawayPage)));
    const html = render();
    const social = html.slice(html.indexOf('<section id="stay-connected"'), html.indexOf('<section id="official-rules"'));
    const copy = language === "es" ? es.giveawayLaunch : en.giveawayLaunch;
    expect(social).toContain(copy.socialTitle);
    expect(social).toContain(copy.socialDescription);
    expect(social).toContain(copy.socialDisclaimer);
    expect(social).toContain('href="https://www.instagram.com/scrub.ops/" target="_blank" rel="noopener noreferrer"');
    expect(social).toContain('href="https://www.tiktok.com/@scrub.ops" target="_blank" rel="noopener noreferrer"');
    expect(social.match(/@scrub.ops<\/span>/g)).toHaveLength(2);
    expect(social).not.toContain("<input");
    expect(html.indexOf('id="alternate-entry"')).toBeLessThan(html.indexOf('id="stay-connected"'));
    expect(html.indexOf('id="stay-connected"')).toBeLessThan(html.indexOf('id="official-rules"'));
    vi.stubGlobal("window", { location: { search: "?campaign=scrub-giveaway-2026-001" } });
    expect(render()).not.toContain('id="stay-connected"');
  });

});
