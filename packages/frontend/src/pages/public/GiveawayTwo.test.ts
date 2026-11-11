import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GiveawayPage } from "./GiveawayPage";
import { GiveawayAssessmentContact } from "./GiveawayAssessmentContact";
import { GiveawayAlternateEntry } from "./GiveawayAlternateEntry";
import { giveawayTwo, giveawayTwoId } from "../../../../../convex/lib/giveawayCampaignTwo";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("convex/react", () => ({ useMutation: () => async () => ({ status: "received" }) }));
const original = { ...giveawayTwo };
afterEach(() => { Object.assign(giveawayTwo, original); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Giveaway #2 preview", () => {
  it("shows the approved future opening, independent gift card and optional offer before entries open", () => {
    Object.assign(giveawayTwo, { startsAt: Date.parse("2026-11-12T09:00:00-05:00"), enabled: true, rulesApproved: true });
    vi.stubGlobal("window", { location: { search: `?campaign=${giveawayTwoId}` } });
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-11T12:00:00-05:00"));
    const html = renderToStaticMarkup(createElement(GiveawayPage));
    expect(html).toContain("Win a $50 Visa Gift Card + an Exclusive SCRUB Offer");
    expect(html).toContain("November 12, 2026");
    expect(html).toContain("9:00 AM");
    expect(html).toContain("December 15, 2026");
    expect(html).toContain("December 17, 2026");
    expect(html).toContain("December 25, 2026");
    expect(html).toContain("January 5, 2027");
    expect(html).toContain("72 hours");
    expect(html).toContain("$949.94");
    expect(html).toContain("NO PURCHASE OR PAYMENT OF ANY KIND");
    expect(giveawayTwo.rules.map(rule => rule.body).join(" ")).not.toMatch(/requires final approval|must be approved|this draft|engineering|legal review|test-mode validation/i);
    expect(html).not.toContain("Proposed rules.");
    expect(html).toContain("This giveaway has not opened");
    expect(html).toContain("decline the optional SCRUB offer and still receive");
    expect(html).not.toContain('id="alternate-email"');
    expect(html).not.toContain(`/assessment?campaign=${giveawayTwoId}`);
  });
  it("displays campaign-specific eligibility and keeps marketing optional and unchecked", () => {
    Object.assign(giveawayTwo, { startsAt: 1, enabled: true, rulesApproved: true });
    vi.spyOn(Date, "now").mockReturnValue(2);
    const html = renderToStaticMarkup(createElement(GiveawayAssessmentContact, { campaignId: giveawayTwoId,
      busy: false, error: "", onComplete: () => {}, onBack: () => {} }));
    expect(html).toContain("excluding Rhode Island");
    expect(html).toContain("do not already hold a SCRUB account at entry");
    expect(html).toContain("December 15, 2026");
    const boxes = html.match(/<input type="checkbox"[^>]*>/g)!;
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toContain("required");
    expect(boxes[1]).not.toContain("required");
    expect(boxes.join()).not.toContain("checked");
    const alternate = renderToStaticMarkup(createElement(GiveawayAlternateEntry, { campaign: giveawayTwo, active: true }));
    expect(alternate).toContain("excluding Rhode Island");
    const alternateBoxes = alternate.match(/<input type="checkbox"[^>]*>/g)!;
    expect(alternateBoxes[2]).not.toContain("required");
    expect(alternateBoxes.join()).not.toContain("checked");
  });
});
