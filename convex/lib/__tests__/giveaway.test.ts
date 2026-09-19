import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { currentGiveawayId, giveawayCampaigns, giveawayState, giveawayAssessmentUrl } from "../giveawayCampaigns";
import { INITIAL_ASSESSMENT_DEFINITION, isApplicable } from "../assessmentDefinition";
import { hashTokenForLookup } from "../tokenHash";

const modules = import.meta.glob("../../**/*.ts");
const campaign = giveawayCampaigns[currentGiveawayId];
const original = { ...campaign };
const now = Date.parse("2026-10-20T12:00:00-04:00");
const backend = () => convexTest(schema, modules);
const giveawayApi = (api as any).giveaways;

async function answered(t: ReturnType<typeof backend>, token = "a", attributed = true, lastOption = false) {
  const capability = token.repeat(64);
  const created = await t.mutation(api.assessments.start, { capability, browserKey: "b".repeat(64), responseLanguage: "en", campaignId: attributed ? currentGiveawayId : undefined, firstResponse: { questionKey: "business.team_size", answerValue: "solo" } });
  const answers: Record<string, string> = { "business.team_size": "solo" };
  for (const question of INITIAL_ASSESSMENT_DEFINITION.questions) {
    if (!question.required || question.key === "business.team_size" || !isApplicable(question, answers)) continue;
    const options = question.options!;
    const answerValue = options[lastOption ? options.length - 1 : 0].value;
    answers[question.key] = answerValue;
    await t.mutation(api.assessments.saveResponse, { ...created, capability, responseLanguage: "en", response: { questionKey: question.key, answerValue } });
  }
  return { ...created, capability };
}
const contact = (email = " Owner@Example.com ") => ({ email, eligibilityConfirmed: true, marketingConsent: false });

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  Object.assign(campaign, { ...original, enabled: true, rulesApproved: true, startsAt: now - 1000 });
});
afterEach(() => { Object.assign(campaign, original); delete campaign.winnerMessage; delete campaign.winnerPublicityApproved; vi.useRealTimers(); });

describe("giveaway campaign", () => {
  it("ships closed until owner launch decisions are completed", () => {
    expect(original.enabled).toBe(false); expect(original.startsAt).toBeNull(); expect(original.rulesApproved).toBe(false);
    expect(giveawayState(original, now)).toBe("upcoming");
  });
  it("uses an exclusive midnight ET boundary and guarded announcement", () => {
    expect(giveawayState(campaign, campaign.startsAt! - 1)).toBe("upcoming");
    expect(giveawayState(campaign, campaign.startsAt!)).toBe("active");
    expect(giveawayState(campaign, campaign.endsAt - 1)).toBe("active");
    expect(new Date(campaign.endsAt).toISOString()).toBe("2026-10-31T04:00:00.000Z");
    expect(giveawayState(campaign, campaign.endsAt)).toBe("ended");
    campaign.winnerMessage = "The prize has been awarded.";
    expect(giveawayState(campaign, campaign.endsAt)).toBe("ended");
    campaign.winnerPublicityApproved = true;
    expect(giveawayState(campaign, campaign.endsAt)).toBe("winner");
    expect(giveawayAssessmentUrl(campaign)).toBe(`/assessment?campaign=${currentGiveawayId}`);
  });
});

describe("canonical entry qualification", () => {
  it("requires contact and eligibility, rolls back invalid completion, and preserves optional consent", async () => {
    const t = backend(); const attempt = await answered(t);
    await expect(t.mutation(api.assessments.complete, attempt)).rejects.toThrow("contact email");
    await expect(t.mutation(api.assessments.complete, { ...attempt, giveawayContact: contact("bad") })).rejects.toThrow("valid email");
    await expect(t.mutation(api.assessments.complete, { ...attempt, giveawayContact: { ...contact(), eligibilityConfirmed: false } })).rejects.toThrow("eligibility");
    expect((await t.run(ctx => ctx.db.get(attempt.attemptId)))?.status).toBe("in_progress");
    await t.mutation(api.assessments.complete, { ...attempt, giveawayContact: contact() });
    const entries = await t.run(ctx => ctx.db.query("giveawayEntries").collect());
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ campaignId: currentGiveawayId, attemptId: attempt.attemptId, normalizedEmail: "owner@example.com", qualifiedAt: now, marketingConsent: false, status: "qualified" });
    expect(entries[0].marketingConsentAt).toBeUndefined();
    expect(JSON.stringify(entries)).not.toMatch(/answerValue|operationsScore|capabilityHash/);
    expect(await t.run(ctx => ctx.db.query("assessmentProspects").collect())).toEqual([]);
    expect((await t.mutation(api.assessments.recover, attempt))?.attempt.sourceSnapshot?.utmCampaign).toBe(currentGiveawayId);
  });
  it("deduplicates email across attempts and retries without deleting assessments", async () => {
    const t = backend(); const first = await answered(t); const second = await answered(t, "c");
    await t.mutation(api.assessments.complete, { ...first, giveawayContact: contact() });
    await t.mutation(api.assessments.complete, { ...first, giveawayContact: contact("different@example.com") });
    await t.mutation(api.assessments.complete, { ...second, giveawayContact: contact("owner@example.com") });
    expect(await t.run(ctx => ctx.db.query("giveawayEntries").collect())).toHaveLength(1);
    expect((await t.run(ctx => ctx.db.get(second.attemptId)))?.giveawayOutcome).toBe("duplicate");
    expect((await t.run(ctx => ctx.db.query("assessmentAttempts").collect())).every(a => a.status === "completed")).toBe(true);
  });
  it("qualifies different scores equally and records affirmative consent separately", async () => {
    const t = backend(); const first = await answered(t); const second = await answered(t, "c", true, true);
    const a = await t.mutation(api.assessments.complete, { ...first, giveawayContact: contact() });
    const b = await t.mutation(api.assessments.complete, { ...second, giveawayContact: { ...contact("another@example.com"), marketingConsent: true } });
    expect(a.operationsScore).not.toBe(b.operationsScore);
    const entries = await t.run(ctx => ctx.db.query("giveawayEntries").collect());
    expect(entries).toHaveLength(2);
    expect(entries.find(e => e.marketingConsent)).toMatchObject({ marketingConsentAt: now, consentVersion: "giveaway_followup_v1" });
  });
  it("serializes competing completions for one normalized email", async () => {
    const t = backend(); const first = await answered(t); const second = await answered(t, "c");
    await Promise.all([
      t.mutation(api.assessments.complete, { ...first, giveawayContact: contact() }),
      t.mutation(api.assessments.complete, { ...second, giveawayContact: contact("owner@example.com") }),
    ]);
    expect(await t.run(ctx => ctx.db.query("giveawayEntries").collect())).toHaveLength(1);
  });
  it("retains attribution when retrying a start whose response was lost", async () => {
    const t = backend(); const attempt = await answered(t, "a", false);
    const retry = await t.mutation(api.assessments.start, { capability: attempt.capability, browserKey: "b".repeat(64), responseLanguage: "en", campaignId: currentGiveawayId, firstResponse: { questionKey: "business.team_size", answerValue: "solo" } });
    expect(retry.attemptId).toBe(attempt.attemptId);
    await t.mutation(api.assessments.complete, { ...attempt, giveawayContact: contact() });
    expect(await t.run(ctx => ctx.db.query("giveawayEntries").collect())).toHaveLength(1);
  });
  it.each(["before", "boundary", "after", "disabled"])("keeps assessment completion without entry %s the period", async position => {
    const t = backend(); const attempt = await answered(t);
    if (position === "before") campaign.startsAt = now + 1;
    else if (position === "disabled") campaign.enabled = false;
    else campaign.endsAt = position === "boundary" ? now : now - 1;
    await t.mutation(api.assessments.complete, attempt);
    expect(await t.run(ctx => ctx.db.query("giveawayEntries").collect())).toEqual([]);
    expect((await t.run(ctx => ctx.db.get(attempt.attemptId)))?.giveawayOutcome).toBe("outside_period");
  });
  it("does not change normal assessments or retroactively enter completed ones", async () => {
    const t = backend(); const attempt = await answered(t, "a", false);
    await t.mutation(api.assessments.complete, attempt);
    await t.mutation(api.assessments.attributeGiveaway, { ...attempt, campaignId: currentGiveawayId });
    await t.mutation(api.assessments.complete, { ...attempt, giveawayContact: contact() });
    expect(await t.run(ctx => ctx.db.query("giveawayEntries").collect())).toEqual([]);
    expect((await t.run(ctx => ctx.db.get(attempt.attemptId)))?.sourceSnapshot).toBeUndefined();
  });
  it("can attribute an unfinished assessment only with its capability", async () => {
    const t = backend(); const attempt = await answered(t, "a", false);
    await expect(t.mutation(api.assessments.attributeGiveaway, { ...attempt, capability: "f".repeat(64), campaignId: currentGiveawayId })).rejects.toThrow("unavailable");
    await t.mutation(api.assessments.attributeGiveaway, { ...attempt, campaignId: currentGiveawayId });
    await t.mutation(api.assessments.complete, { ...attempt, giveawayContact: contact() });
    expect(await t.run(ctx => ctx.db.query("giveawayEntries").collect())).toHaveLength(1);
  });
  it("restricts paginated entrant export to a verified superadmin session", async () => {
    const t = backend(); const attempt = await answered(t);
    await t.mutation(api.assessments.complete, { ...attempt, giveawayContact: contact() });
    const { founder, owner } = await t.run(async ctx => {
      const founder = await ctx.db.insert("users", { name: "Founder", passwordHash: "unused-test-password", email: "dzbfyse@gmail.com", role: "affiliate", status: "active" });
      const owner = await ctx.db.insert("users", { name: "Owner", passwordHash: "unused-test-password", email: "other@example.com", role: "owner", status: "active" });
      for (const [userId, token] of [[founder, "founder-session"], [owner, "owner-session"]] as const) await ctx.db.insert("authSessions", { userId, principalType: "staff", version: 1, tokenHash: await hashTokenForLookup(token), createdAt: now, lastUsedAt: now, expiresAt: now + 100000, idleExpiresAt: now + 100000 });
      return { founder, owner };
    });
    const args = { userId: founder, sessionToken: "invalid", campaignId: currentGiveawayId, paginationOpts: { cursor: null, numItems: 1 } };
    await expect(t.query(giveawayApi.entrants, args)).rejects.toThrow();
    await expect(t.query(giveawayApi.entrants, { ...args, userId: owner, sessionToken: "owner-session" })).rejects.toThrow("Super admin");
    const result = await t.query(giveawayApi.entrants, { ...args, sessionToken: "founder-session" });
    expect(result.page).toHaveLength(1);
    const next = await t.query(giveawayApi.entrants, { ...args, sessionToken: "founder-session", paginationOpts: { cursor: result.continueCursor, numItems: 1 } });
    expect(next.page).toHaveLength(0); expect(next.isDone).toBe(true);
  });
});
