import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GiveawayPage } from "./GiveawayPage";
import { GiveawayAssessmentContact } from "./GiveawayAssessmentContact";
import { GiveawayAlternateEntry } from "./GiveawayAlternateEntry";
import { currentGiveawayId, giveawayCampaigns } from "../../../../../convex/lib/giveawayCampaigns";
import { giveawayHtml } from "../../../build/giveawayMetadata";
import { loadProgress, saveProgress } from "../../lib/assessmentPersistence";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("convex/react", () => ({ useMutation: () => async () => ({ status: "received" }) }));

const campaign = giveawayCampaigns[currentGiveawayId];
const original = { ...campaign };
const read = (file: string) => readFileSync(file, "utf8");
function render(time: number) {
  vi.stubGlobal("window", { location: { search: "" } });
  vi.spyOn(Date, "now").mockReturnValue(time);
  return renderToStaticMarkup(createElement(GiveawayPage));
}
afterEach(() => { Object.assign(campaign, original); delete campaign.winnerMessage; delete campaign.winnerPublicityApproved; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("public giveaway", () => {
  it("requires entry email and eligibility but leaves marketing unchecked and optional", () => {
    Object.assign(campaign, { enabled: true, rulesApproved: true, startsAt: campaign.endsAt - 10000 });
    vi.spyOn(Date, "now").mockReturnValue(campaign.endsAt - 1);
    const html = renderToStaticMarkup(createElement(GiveawayAssessmentContact, { campaignId: currentGiveawayId, busy: false, error: "", onComplete: () => {}, onBack: () => {} }));
    expect(html).toMatch(/type="email"[^>]*required=""/);
    const checkboxes = html.match(/<input type="checkbox"[^>]*>/g)!;
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toContain('required=""');
    expect(checkboxes[1]).not.toContain("required");
    expect(checkboxes.join()).not.toContain("checked");
    expect(html).toContain("assessment.giveaway.emailHelp");
  });
  it("does not collect contact data when the campaign is closed", () => {
    vi.spyOn(Date, "now").mockReturnValue(campaign.endsAt);
    const html = renderToStaticMarkup(createElement(GiveawayAssessmentContact, { campaignId: currentGiveawayId, busy: false, error: "", onComplete: () => {}, onBack: () => {} }));
    expect(html).toContain("assessment.giveaway.closed");
    expect(html).not.toContain('type="email"');
  });
  it("renders upcoming with readable deadline and accessible rules", () => {
    const html = render(campaign.endsAt - 1000);
    expect(html).toContain("has not opened"); expect(html).toContain("September 21, 2026");
    expect(html).toContain('id="official-rules"'); expect(html).toContain("11:59 PM ET");
    expect(html).not.toContain("11:59:59"); expect(html).not.toContain("Take the assessment to enter");
    expect(html).toContain("No purchase necessary"); expect(html).toContain('href="/privacy"');
  });
  it("renders an active attributed CTA and closes it at the boundary", () => {
    Object.assign(campaign, { enabled: true, rulesApproved: true, startsAt: campaign.endsAt - 10000 });
    expect(render(campaign.endsAt - 1)).toContain(`/assessment?campaign=${currentGiveawayId}`);
    const ended = render(campaign.endsAt);
    expect(ended).toContain("Entries are closed"); expect(ended).toContain('id="official-rules"');
    expect(ended).not.toContain(`/assessment?campaign=${currentGiveawayId}`);
    expect(ended).toContain("does not enter this giveaway");
    expect(ended).toContain("Alternate entries are not open");
    expect(ended).not.toContain('id="alternate-email"');
  });
  it("discloses equally treated AMOE beside the primary Assessment CTA and in the rules", () => {
    Object.assign(campaign, { enabled: true, rulesApproved: true });
    const html = render(campaign.startsAt!);
    expect(html).toContain(`/assessment?campaign=${currentGiveawayId}`);
    expect(html).toContain('href="#alternate-entry"');
    expect(html).toContain("Assessment completion is not required to enter");
    expect(html).toContain("Method A — Assessment entry");
    expect(html).toContain("Method B — free alternate online entry");
    expect(html).toContain("Scrubadub Solutions LLC, operator of SCRUB");
    expect(html).toContain("November 2, 2026");
    expect(html).toContain("same chance of winning");
    expect(html).toContain('id="alternate-email"');
    expect(render(campaign.startsAt! - 1)).not.toContain('id="alternate-email"');
  });
  it("collects only the alternate-entry fields with separate required confirmations and optional unchecked marketing", () => {
    const html = renderToStaticMarkup(createElement(GiveawayAlternateEntry, { campaign, active: true }));
    expect(html).toMatch(/id="alternate-first-name"[^>]*required=""/);
    expect(html).toMatch(/id="alternate-last-name"[^>]*required=""/);
    expect(html).toMatch(/type="email"[^>]*required=""/);
    const boxes = html.match(/<input type="checkbox"[^>]*>/g)!;
    expect(boxes).toHaveLength(3);
    expect(boxes[0]).toContain("required"); expect(boxes[1]).toContain("required");
    expect(boxes[2]).not.toContain("required"); expect(boxes.join()).not.toContain("checked");
    expect(html.match(/<input /g)).toHaveLength(6);
    expect(html).not.toMatch(/type="(?:tel|file|password)"/);
  });
  it("shows only an explicitly approved winner announcement", () => {
    campaign.winnerMessage = "The prize has been awarded.";
    expect(render(campaign.endsAt)).not.toContain(campaign.winnerMessage);
    campaign.winnerPublicityApproved = true;
    expect(render(campaign.endsAt)).toContain(campaign.winnerMessage);
  });
  it("reserves a public route before authentication and keeps static metadata isolated", () => {
    const app = read("packages/frontend/src/App.tsx");
    expect(app.indexOf('pathname === "/giveaway"')).toBeLessThan(app.indexOf("// --- GUARD 1"));
    expect(app).toContain('"/assessment", "/giveaway"');
    const index = read("packages/frontend/index.html");
    const output = giveawayHtml(index);
    expect(output).toContain(`<title>${campaign.name} | SCRUB</title>`);
    expect(output).toContain('property="og:url" content="https://scrubscrubscrub.com/giveaway"');
    expect(output).toContain('name="twitter:title" content="SCRUB Cleaning Owner Giveaway | SCRUB"');
    expect(output).toContain(`name="description" content="${campaign.headline}"`);
    expect(output).toContain(`property="og:description" content="${campaign.headline}"`);
    expect(output).toContain("scrub-social-preview.png");
    expect(index).not.toContain("Cleaning Owner Giveaway");
  });
  it("persists attribution across browser reloads without storing entry email", () => {
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) } as unknown as Storage;
    saveProgress({ campaignId: currentGiveawayId, answers: {}, language: "es", lastActivityAt: 1 }, storage);
    expect(loadProgress(storage)?.campaignId).toBe(currentGiveawayId);
    expect([...data.values()].join()).not.toContain("email");
    const page = read("packages/frontend/src/pages/public/OperationsAssessmentPage.tsx");
    expect(page).toContain("campaignId: latest.campaignId"); expect(page).toContain("attributeGiveaway({");
    expect(page).toContain("capability: latest.capability, giveawayContact");
  });
});
