import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { currentGiveawayId, firstGiveawayId, giveawayCampaigns, giveawayState } from "../giveawayCampaigns";
import { giveawayTwo, giveawayTwoId } from "../giveawayCampaignTwo";
const modules = import.meta.glob("../../**/*.ts");
const open = Date.parse("2026-11-12T09:00:00-05:00");
const close = Date.parse("2026-12-16T00:00:00-05:00");
afterEach(() => vi.restoreAllMocks());

describe("founder-approved activation proposal (no production deployment)", () => {
  it("pins the approved opening, closing, default and rules without replacing Giveaway #1", () => {
    expect(currentGiveawayId).toBe(giveawayTwoId);
    expect(giveawayTwo).toMatchObject({ startsAt: open, endsAt: close, enabled: true, rulesApproved: true, rulesVersion: "scrub-giveaway-2026-002-rules-v1" });
    expect(new Date(open).toISOString()).toBe("2026-11-12T14:00:00.000Z");
    expect(new Date(close).toISOString()).toBe("2026-12-16T05:00:00.000Z");
    expect(giveawayCampaigns[firstGiveawayId].campaignId).toBe(firstGiveawayId);
    expect(giveawayCampaigns[firstGiveawayId].prize.arv).toBe("$100 USD");
  });
  it.each([[open - 1, false], [open, true], [close - 1, true], [close, false]] as const)("enforces the server boundary at %s (accepts=%s)", async (time, accepts) => {
    vi.spyOn(Date, "now").mockReturnValue(time);
    const t = convexTest(schema, modules);
    const action = t.mutation(api.giveaways.enterAlternate, { campaignId: giveawayTwoId, rulesVersion: giveawayTwo.rulesVersion,
      browserKey: "f".repeat(64), firstName: "Synthetic", lastName: "Boundary", email: "boundary@example.test",
      eligibilityConfirmed: true, rulesAcknowledged: true, marketingConsent: false });
    if (accepts) await expect(action).resolves.toEqual({ status: "received" });
    else await expect(action).rejects.toThrow("not open");
    expect(giveawayState(giveawayTwo, time) === "active").toBe(accepts);
    expect(await t.run(ctx => ctx.db.query("giveawayEntries").collect())).toHaveLength(accepts ? 1 : 0);
    expect(await t.run(ctx => ctx.db.system.query("_scheduled_functions").collect())).toHaveLength(0);
  });
});
