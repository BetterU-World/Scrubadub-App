import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { giveawayCampaigns, firstGiveawayId, currentGiveawayId, giveawayState } from "../giveawayCampaigns";
import { giveawayTwo, giveawayTwoId } from "../giveawayCampaignTwo";
import { recordGiveawayEntry } from "../giveawayEntries";
import { INITIAL_ASSESSMENT_DEFINITION, isApplicable } from "../assessmentDefinition";
import { hashTokenForLookup } from "../tokenHash";

const modules = import.meta.glob("../../**/*.ts");
const original = { ...giveawayTwo };
const now = Date.parse("2026-11-12T12:00:00-05:00");
const contact = { rulesVersion: giveawayTwo.rulesVersion, email: "Owner@Example.test", eligibilityConfirmed: true, rulesAcknowledged: true, marketingConsent: false };
const person = { firstName: "Pat", lastName: "Owner" };
const origin = { entryMethod: "alternate" as const, ...person };
beforeEach(() => vi.spyOn(Date, "now").mockReturnValue(now));
afterEach(() => { Object.assign(giveawayTwo, original); vi.restoreAllMocks(); });
const armTestCampaign = () => Object.assign(giveawayTwo, { startsAt: now - 1000, enabled: true, rulesApproved: true });

async function answeredAssessment(t: ReturnType<typeof convexTest>, campaignId?: string, language: "en" | "es" = "en") {
    const capability = "d".repeat(64);
    const created = await t.mutation(api.assessments.start, { capability, browserKey: "e".repeat(64), responseLanguage: language, campaignId,
      firstResponse: { questionKey: "business.team_size", answerValue: "solo" } });
    const answers: Record<string, string> = { "business.team_size": "solo" };
    for (const question of INITIAL_ASSESSMENT_DEFINITION.questions) {
      if (!question.required || question.key === "business.team_size" || !isApplicable(question, answers)) continue;
      const answerValue = question.options![0].value; answers[question.key] = answerValue;
      await t.mutation(api.assessments.saveResponse, { ...created, capability, responseLanguage: language, response: { questionKey: question.key, answerValue } });
    }
  return { created, capability };
}

describe("Giveaway #2 safety", () => {
  it.each(["en", "es"] as const)("records the approved version from a completed %s assessment without enrollment or emails", async language => {
    armTestCampaign(); const t = convexTest(schema, modules);
    const { created, capability } = await answeredAssessment(t, giveawayTwoId, language);
    const { rulesAcknowledged: _rules, ...giveawayContact } = contact;
    await t.mutation(api.assessments.complete, { ...created, capability, giveawayContact });
    expect(await t.run(ctx => ctx.db.query("giveawayEntries").collect())).toMatchObject([
      { campaignId: giveawayTwoId, rulesVersion: "scrub-giveaway-2026-002-rules-v1", marketingConsent: false, entryMethod: "assessment" },
    ]);
    expect((await t.run(ctx => ctx.db.get(created.attemptId)))?.responseLanguage).toBe(language);
    expect(await t.run(ctx => ctx.db.query("users").collect())).toHaveLength(0);
    expect(await t.run(ctx => ctx.db.query("companies").collect())).toHaveLength(0);
    expect(await t.run(ctx => ctx.db.system.query("_scheduled_functions").collect())).toHaveLength(0);
  });
  it("exports only the selected campaign's combined pool for a verified superadmin", async () => {
    armTestCampaign(); const t = convexTest(schema, modules);
    const { created, capability } = await answeredAssessment(t, giveawayTwoId);
    const { rulesAcknowledged: _rules, ...giveawayContact } = contact;
    await t.mutation(api.assessments.complete, { ...created, capability, giveawayContact });
    await t.mutation(api.giveaways.enterAlternate, { campaignId: giveawayTwoId, browserKey: "a".repeat(64), ...person, ...contact, email: "alternate@example.test" });
    await t.run(ctx => recordGiveawayEntry(ctx, firstGiveawayId, Date.parse("2026-10-20T12:00:00-04:00"), contact, origin));
    const admin = await t.run(async ctx => {
      const userId = await ctx.db.insert("users", { email: "synthetic-admin@example.test", name: "Admin", role: "affiliate", status: "active", passwordHash: "synthetic" });
      await ctx.db.insert("platformAdmins", { userId, active: true, revision: 1, updatedAt: now });
      await ctx.db.insert("authSessions", { userId, principalType: "staff", version: 1, tokenHash: await hashTokenForLookup("launch-export"), createdAt: now, lastUsedAt: now, expiresAt: now + 100000, idleExpiresAt: now + 100000 });
      return userId;
    });
    const args = { userId: admin, sessionToken: "launch-export", campaignId: giveawayTwoId, paginationOpts: { cursor: null, numItems: 250 } };
    const exported = await t.query(api.giveaways.entrants, args);
    expect(exported.isDone).toBe(true); expect(exported.page).toHaveLength(2);
    expect(new Set(exported.page.map(row => row.entryMethod))).toEqual(new Set(["assessment", "alternate"]));
    expect(exported.page.every(row => row.campaignId === giveawayTwoId)).toBe(true);
    const historical = await t.query(api.giveaways.entrants, { ...args, campaignId: firstGiveawayId });
    expect(historical.page).toHaveLength(1); expect(historical.page[0].campaignId).toBe(firstGiveawayId);
  });
  it("preserves the complete Giveaway #1 configuration and rules", () => {
    expect(firstGiveawayId).toBe("scrub-giveaway-2026-001");
    expect(createHash("sha256").update(JSON.stringify(giveawayCampaigns[firstGiveawayId])).digest("hex"))
      .toBe("74f1fa0d841041b3e89fadce078722b5bcf412374bed0fad74d15ca0fd806bb7");
    expect(giveawayTwo.rulesVersion).not.toBe(giveawayCampaigns[firstGiveawayId].rulesVersion);
  });
  it("cannot open automatically on the intended date without an approved actual opening", async () => {
    Object.assign(giveawayTwo, { startsAt: null, enabled: false, rulesApproved: false });
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
    const old = await t.run(ctx => recordGiveawayEntry(ctx, firstGiveawayId,
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
