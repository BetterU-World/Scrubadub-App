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
const alternate = (email = " Owner@Example.com ") => ({ campaignId: currentGiveawayId, browserKey: "d".repeat(64), firstName: " Pat ", lastName: " Cleaner ", email, eligibilityConfirmed: true, rulesAcknowledged: true });

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  Object.assign(campaign, { ...original, enabled: true, rulesApproved: true, startsAt: now - 1000 });
});
afterEach(() => { Object.assign(campaign, original); delete campaign.winnerMessage; delete campaign.winnerPublicityApproved; vi.useRealTimers(); });

describe("giveaway campaign", () => {
  it("ships closed until owner launch decisions are completed", () => {
    expect(original.enabled).toBe(false); expect(new Date(original.startsAt!).toISOString()).toBe("2026-09-21T04:00:00.000Z"); expect(original.rulesApproved).toBe(false);
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
    expect(entries[0]).toMatchObject({ campaignId: currentGiveawayId, entryMethod: "assessment", attemptId: attempt.attemptId, normalizedEmail: "owner@example.com", qualifiedAt: now, marketingConsent: false, status: "qualified", rulesAcknowledgedAt: now });
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
    // Simulate a PR #199 row that predates entryMethod.
    await t.run(async ctx => { const entry = (await ctx.db.query("giveawayEntries").collect())[0]; await ctx.db.patch(entry._id, { entryMethod: undefined }); });
    await t.mutation(giveawayApi.enterAlternate, alternate("second@example.com"));
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
    expect(result.page[0].entryMethod).toBe("assessment");
    const next = await t.query(giveawayApi.entrants, { ...args, sessionToken: "founder-session", paginationOpts: { cursor: result.continueCursor, numItems: 1 } });
    expect(next.page).toHaveLength(1); expect(next.page[0].entryMethod).toBe("alternate");
    const last = await t.query(giveawayApi.entrants, { ...args, sessionToken: "founder-session", paginationOpts: { cursor: next.continueCursor, numItems: 1 } });
    expect(last.page).toHaveLength(0); expect(last.isDone).toBe(true);
  });
});

describe("free alternate entry in the canonical pool", () => {
  it("accepts anonymous AMOE with separate attestations and no marketing consent or Assessment", async () => {
    const t = backend();
    expect(await t.mutation(giveawayApi.enterAlternate, alternate())).toEqual({ status: "received" });
    const entries = await t.run(ctx => ctx.db.query("giveawayEntries").collect());
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ campaignId: currentGiveawayId, entryMethod: "alternate", firstName: "Pat", lastName: "Cleaner", normalizedEmail: "owner@example.com", status: "qualified", qualifiedAt: now, eligibilityConfirmedAt: now, rulesAcknowledgedAt: now, marketingConsent: false });
    expect(entries[0].attemptId).toBeUndefined(); expect(entries[0].marketingConsentAt).toBeUndefined();
    expect(await t.run(ctx => ctx.db.query("assessmentAttempts").collect())).toHaveLength(0);
    expect(await t.run(ctx => ctx.db.query("assessmentProspects").collect())).toHaveLength(0);
  });
  it.each([
    { email: "" }, { email: "invalid" }, { email: undefined },
    { eligibilityConfirmed: false }, { eligibilityConfirmed: undefined },
    { rulesAcknowledged: false }, { rulesAcknowledged: undefined },
    { firstName: " " }, { lastName: "x".repeat(81) }, { firstName: "<script>" },
  ])("does not qualify invalid/missing contact or confirmation: %j", async invalid => {
    const t = backend();
    await expect(t.mutation(giveawayApi.enterAlternate, { ...alternate(), ...invalid })).rejects.toThrow();
    expect(await t.run(ctx => ctx.db.query("giveawayEntries").collect())).toHaveLength(0);
  });
  it.each(["before", "close", "after", "disabled", "unapproved", "unknown"])("rejects AMOE while %s", async position => {
    const t = backend();
    if (position === "before") campaign.startsAt = now + 1;
    if (position === "close") campaign.endsAt = now;
    if (position === "after") campaign.endsAt = now - 1;
    if (position === "disabled") campaign.enabled = false;
    if (position === "unapproved") campaign.rulesApproved = false;
    await expect(t.mutation(giveawayApi.enterAlternate, { ...alternate(), campaignId: position === "unknown" ? "not-a-campaign" : currentGiveawayId })).rejects.toThrow("not open");
    expect(await t.run(ctx => ctx.db.query("giveawayEntries").collect())).toHaveLength(0);
  });
  it("accepts both exact opening and the last millisecond before the exclusive close", async () => {
    const t = backend(); campaign.startsAt = original.startsAt;
    vi.setSystemTime(campaign.startsAt!);
    await t.mutation(giveawayApi.enterAlternate, alternate("opening@example.com"));
    vi.setSystemTime(campaign.endsAt - 1);
    await t.mutation(giveawayApi.enterAlternate, alternate("closing@example.com"));
    const entries = await t.run(ctx => ctx.db.query("giveawayEntries").collect());
    expect(entries.map(e => e.qualifiedAt).sort()).toEqual([campaign.startsAt, campaign.endsAt - 1].sort());
    vi.setSystemTime(campaign.endsAt);
    await expect(t.mutation(giveawayApi.enterAlternate, alternate("late@example.com"))).rejects.toThrow("not open");
  });
  it("keeps first entry and consent unchanged on repeated AMOE with identical public receipts", async () => {
    const t = backend();
    const first = await t.mutation(giveawayApi.enterAlternate, alternate());
    const repeat = await t.mutation(giveawayApi.enterAlternate, { ...alternate("owner@example.com"), firstName: "Changed", marketingConsent: true });
    expect(repeat).toEqual(first); expect(repeat).toEqual({ status: "received" });
    const entries = await t.run(ctx => ctx.db.query("giveawayEntries").collect());
    expect(entries).toHaveLength(1); expect(entries[0]).toMatchObject({ firstName: "Pat", marketingConsent: false });
    await t.mutation(giveawayApi.enterAlternate, { ...alternate("consent@example.com"), marketingConsent: true });
    const consented = (await t.run(ctx => ctx.db.query("giveawayEntries").collect())).find(e => e.marketingConsent);
    expect(consented).toMatchObject({ marketingConsentAt: now, consentVersion: "giveaway_followup_v1" });
  });
  it.each(["assessment", "alternate"])("deduplicates across methods when %s qualifies first", async first => {
    const t = backend(); const attempt = await answered(t);
    if (first === "alternate") await t.mutation(giveawayApi.enterAlternate, alternate());
    await t.mutation(api.assessments.complete, { ...attempt, giveawayContact: contact() });
    await t.mutation(api.assessments.complete, { ...attempt, giveawayContact: contact() });
    await t.mutation(giveawayApi.enterAlternate, alternate("owner@example.com"));
    const entries = await t.run(ctx => ctx.db.query("giveawayEntries").collect());
    expect(entries).toHaveLength(1); expect(entries[0].entryMethod).toBe(first);
    const completed = await t.run(ctx => ctx.db.get(attempt.attemptId));
    expect(completed?.status).toBe("completed");
    expect(completed?.giveawayOutcome).toBe(first === "assessment" ? "qualified" : "duplicate");
  });
  it("serializes competing alternate and Assessment submissions without additional entries", async () => {
    const t = backend(); const attempt = await answered(t);
    await Promise.all([
      t.mutation(api.assessments.complete, { ...attempt, giveawayContact: contact() }),
      t.mutation(giveawayApi.enterAlternate, alternate()),
      t.mutation(giveawayApi.enterAlternate, { ...alternate("owner@example.com"), browserKey: "e".repeat(64) }),
    ]);
    expect(await t.run(ctx => ctx.db.query("giveawayEntries").collect())).toHaveLength(1);
    expect((await t.run(ctx => ctx.db.get(attempt.attemptId)))?.status).toBe("completed");
  });
  it("records campaign-only event metadata without entrant PII and limits repeated public writes", async () => {
    const t = backend();
    for (let i = 0; i < 10; i++) await t.mutation(giveawayApi.enterAlternate, alternate());
    await expect(t.mutation(giveawayApi.enterAlternate, alternate())).rejects.toThrow("Rate limit");
    expect(await t.run(ctx => ctx.db.query("giveawayEntries").collect())).toHaveLength(1);
    const events = await t.run(ctx => ctx.db.query("assessmentEvents").collect());
    expect(events.map(e => e.eventKey).sort()).toEqual(["giveaway_alternate_entry_qualified", "giveaway_duplicate_entry_detected"].sort());
    expect(events.every(e => JSON.stringify(e.metadata) === JSON.stringify({ campaignId: currentGiveawayId }))).toBe(true);
    expect(JSON.stringify(events)).not.toMatch(/owner@example.com|Pat|Cleaner/);
  });
});
