import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { giveawayCampaigns, currentGiveawayId, giveawayState } from "../giveawayCampaigns";
import { giveawayTwo, giveawayTwoId } from "../giveawayCampaignTwo";
import { recordGiveawayEntry } from "../giveawayEntries";
import { INITIAL_ASSESSMENT_DEFINITION, isApplicable } from "../assessmentDefinition";

const modules = import.meta.glob("../../**/*.ts");
const original = { ...giveawayTwo };
const now = Date.parse("2026-11-12T12:00:00-05:00");
const contact = { rulesVersion: giveawayTwo.rulesVersion, email: "Owner@Example.test", eligibilityConfirmed: true, rulesAcknowledged: true, marketingConsent: false };
const person = { firstName: "Pat", lastName: "Owner" };
const origin = { entryMethod: "alternate" as const, ...person };
beforeEach(() => vi.spyOn(Date, "now").mockReturnValue(now));
afterEach(() => { Object.assign(giveawayTwo, original); vi.restoreAllMocks(); });
const armTestCampaign = () => Object.assign(giveawayTwo, { startsAt: now - 1000, enabled: true, rulesApproved: true });

async function answeredAssessment(t: ReturnType<typeof convexTest>, campaignId?: string) {
    const capability = "d".repeat(64);
    const created = await t.mutation(api.assessments.start, { capability, browserKey: "e".repeat(64), responseLanguage: "en", campaignId,
      firstResponse: { questionKey: "business.team_size", answerValue: "solo" } });
    const answers: Record<string, string> = { "business.team_size": "solo" };
    for (const question of INITIAL_ASSESSMENT_DEFINITION.questions) {
      if (!question.required || question.key === "business.team_size" || !isApplicable(question, answers)) continue;
      const answerValue = question.options![0].value; answers[question.key] = answerValue;
      await t.mutation(api.assessments.saveResponse, { ...created, capability, responseLanguage: "en", response: { questionKey: question.key, answerValue } });
    }
  return { created, capability };
}

describe("Giveaway #2 safety", () => {
  it("preserves the complete Giveaway #1 configuration and rules", () => {
    expect(currentGiveawayId).toBe("scrub-giveaway-2026-001");
    expect(createHash("sha256").update(JSON.stringify(giveawayCampaigns[currentGiveawayId])).digest("hex"))
      .toBe("74f1fa0d841041b3e89fadce078722b5bcf412374bed0fad74d15ca0fd806bb7");
    expect(giveawayTwo.rulesVersion).not.toBe(giveawayCampaigns[currentGiveawayId].rulesVersion);
  });
  it("cannot open automatically on the intended date without an approved actual opening", async () => {
    expect(giveawayTwo).toMatchObject({ startsAt: null, enabled: false, rulesApproved: false });
    expect(giveawayState(giveawayTwo, now)).toBe("upcoming");
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.giveaways.enterAlternate, { campaignId: giveawayTwoId, browserKey: "a".repeat(64), ...contact, ...person })).rejects.toThrow("not open");
    giveawayTwo.enabled = true; giveawayTwo.rulesApproved = true;
    expect(giveawayState(giveawayTwo, now)).toBe("upcoming");
    giveawayTwo.startsAt = now + 1000;
    expect(giveawayState(giveawayTwo, now)).toBe("upcoming");
  });
  it("uses the approved actual opening and an exclusive midnight Eastern closing", () => {
    armTestCampaign();
    const start = giveawayTwo.startsAt!;
    expect(giveawayState(giveawayTwo, start - 1)).toBe("upcoming");
    expect(giveawayState(giveawayTwo, start)).toBe("active");
    expect(new Date(giveawayTwo.endsAt).toISOString()).toBe("2026-12-16T05:00:00.000Z");
    expect(giveawayState(giveawayTwo, giveawayTwo.endsAt - 1)).toBe("active");
    expect(giveawayState(giveawayTwo, giveawayTwo.endsAt)).toBe("ended");
    giveawayTwo.rulesApproved = false;
    expect(giveawayState(giveawayTwo, now)).toBe("upcoming");
  });
  it("isolates campaign pools, retains old records, deduplicates new entries and does not schedule emails", async () => {
    armTestCampaign();
    const t = convexTest(schema, modules);
    const old = await t.run(ctx => recordGiveawayEntry(ctx, currentGiveawayId,
      Date.parse("2026-10-20T12:00:00-04:00"), contact, origin));
    const saved = await t.run(ctx => ctx.db.get(old.entryId));
    const args = { campaignId: giveawayTwoId, browserKey: "b".repeat(64), ...contact, ...person };
    await Promise.all([t.mutation(api.giveaways.enterAlternate, args),
      t.mutation(api.giveaways.enterAlternate, { ...args, email: " owner@example.test ", marketingConsent: true })]);
    const entries = await t.run(ctx => ctx.db.query("giveawayEntries").collect());
    expect(entries).toHaveLength(2);
    expect(await t.run(ctx => ctx.db.get(old.entryId))).toEqual(saved);
    expect(entries.find(e => e.campaignId === giveawayTwoId)).toMatchObject({ rulesVersion: giveawayTwo.rulesVersion,
      eligibilityConfirmedAt: now, rulesAcknowledgedAt: now, normalizedEmail: "owner@example.test" });
    expect(await t.run(ctx => ctx.db.system.query("_scheduled_functions").collect())).toHaveLength(0);
  });
  it.each([{ eligibilityConfirmed: false }, { rulesAcknowledged: false }])("requires the new campaign's acknowledgments: %j", async override => {
    armTestCampaign(); const t = convexTest(schema, modules);
    await expect(t.mutation(api.giveaways.enterAlternate, { campaignId: giveawayTwoId, browserKey: "c".repeat(64),
      ...person, ...contact, ...override })).rejects.toThrow();
    expect(await t.run(ctx => ctx.db.query("giveawayEntries").collect())).toHaveLength(0);
  });
  it("rejects a stale rules acknowledgment and entries after closing", async () => {
    armTestCampaign(); const t = convexTest(schema, modules);
    const args = { campaignId: giveawayTwoId, browserKey: "c".repeat(64), ...person, ...contact };
    await expect(t.mutation(api.giveaways.enterAlternate, { ...args, rulesVersion: "old-version" })).rejects.toThrow("current campaign Official Rules");
    vi.mocked(Date.now).mockReturnValue(giveawayTwo.endsAt);
    await expect(t.mutation(api.giveaways.enterAlternate, args)).rejects.toThrow("not open");
    expect(await t.run(ctx => ctx.db.query("giveawayEntries").collect())).toHaveLength(0);
  });
  it("accepts an eligible prior assessment participant without rewriting or importing their assessment", async () => {
    armTestCampaign(); const t = convexTest(schema, modules);
    const { created, capability } = await answeredAssessment(t);
    await t.mutation(api.assessments.complete, { ...created, capability });
    const saved = await t.run(ctx => ctx.db.get(created.attemptId));
    expect(await t.run(ctx => ctx.db.query("giveawayEntries").collect())).toHaveLength(0);
    await t.mutation(api.giveaways.enterAlternate, { campaignId: giveawayTwoId, browserKey: "f".repeat(64), ...person, ...contact });
    expect(await t.run(ctx => ctx.db.get(created.attemptId))).toEqual(saved);
    expect(await t.run(ctx => ctx.db.query("giveawayEntries").collect())).toMatchObject([
      { campaignId: giveawayTwoId, entryMethod: "alternate", marketingConsent: false },
    ]);
  });
  it("uses canonical assessment completion with the new rules and deduplicates across both methods", async () => {
    armTestCampaign(); const t = convexTest(schema, modules);
    const { created, capability } = await answeredAssessment(t, giveawayTwoId);
    const { rulesAcknowledged: _acknowledged, ...assessmentContact } = contact;
    await expect(t.mutation(api.assessments.complete, { ...created, capability,
      giveawayContact: { ...assessmentContact, rulesVersion: "stale" } })).rejects.toThrow("current campaign Official Rules");
    expect((await t.run(ctx => ctx.db.get(created.attemptId)))?.status).toBe("in_progress");
    await t.mutation(api.assessments.complete, { ...created, capability, giveawayContact: assessmentContact });
    await t.mutation(api.giveaways.enterAlternate, { campaignId: giveawayTwoId, browserKey: "f".repeat(64), ...person, ...contact });
    expect(await t.run(ctx => ctx.db.query("giveawayEntries").collect())).toMatchObject([
      { campaignId: giveawayTwoId, entryMethod: "assessment", attemptId: created.attemptId,
        rulesVersion: giveawayTwo.rulesVersion, marketingConsent: false },
    ]);
  });
});
