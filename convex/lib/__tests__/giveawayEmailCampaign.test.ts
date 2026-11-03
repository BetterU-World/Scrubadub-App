import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { createHmac } from "node:crypto";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import { hashTokenForLookup } from "../tokenHash";
import { CAMPAIGN, category, configuration, outgoing, preview, emailIdentity, unsubscribeToken, verifyUnsubscribe, approvalPhrase } from "../giveawayCampaignEmail";
import { giveawayCampaigns } from "../giveawayCampaigns";

const { send, verifyWebhook } = vi.hoisted(() => ({ send: vi.fn(), verifyWebhook: vi.fn() }));
vi.mock("resend", () => ({ Resend: class { emails = { send }; webhooks = { verify: verifyWebhook }; } }));
const modules = import.meta.glob("../../**/*.ts");
const functions = (api as any).giveawayEmailCampaign;
const privateFunctions = (internal as any).giveawayEmailCampaign;
const delivery = (api as any).actions.giveawayCampaignDelivery;
const now = Date.parse("2026-11-02T18:00:00Z");
const winner = "winner@example.test";
const sample = (email: string, consent = true) => ({ campaignId: CAMPAIGN, originalEmail: email, normalizedEmail: email.trim().toLowerCase(), status: "qualified" as const, rulesVersion: giveawayCampaigns[CAMPAIGN].rulesVersion, qualifiedAt: giveawayCampaigns[CAMPAIGN].startsAt! + 86400000, eligibilityConfirmedAt: now - 100000, marketingConsent: consent, ...(consent ? { marketingConsentAt: now - 100000, consentVersion: "giveaway_followup_v1" } : {}) });
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  for (const [key, value] of Object.entries({ RESEND_API_KEY: "synthetic-key", RESEND_FROM_EMAIL: "Existing Name <sender@example.test>", SCRUB_CAMPAIGN_REPLY_TO: "reply@example.test", SCRUB_CAMPAIGN_POSTAL_ADDRESS: "123 Example Avenue, Sample City, ZZ 00000", CONVEX_SITE_URL: "https://backend.example.test", APP_URL: "https://app.example.test", SCRUB_GIVEAWAY_WINNER_EMAIL: winner, SCRUB_CAMPAIGN_UNSUBSCRIBE_SECRET: "synthetic-signing-key-32-characters-only", SCRUB_CAMPAIGN_TEST_RECIPIENTS: "reviewer@example.test", SCRUB_CAMPAIGN_ALLOWED_SEND_MODE: "production", SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS: "false" })) vi.stubEnv(key, value);
  vi.stubEnv("SCRUB_CAMPAIGN_RESEND_WEBHOOK_SECRET", "synthetic-webhook-secret");
  send.mockReset(); send.mockResolvedValue({ data: { id: "provider-accepted-1" }, error: null });
  verifyWebhook.mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
async function setup() {
  const t = convexTest(schema, modules);
  const { admin, owner } = await t.run(async ctx => {
    const admin = await ctx.db.insert("users", { name: "Synthetic Admin", email: "admin@example.test", passwordHash: "unused", role: "affiliate", status: "active" });
    const owner = await ctx.db.insert("users", { name: "Synthetic Owner", email: "owner@example.test", passwordHash: "unused", role: "owner", status: "active" });
    await ctx.db.insert("platformAdmins", { userId: admin, active: true, revision: 1, updatedAt: now });
    for (const [userId, token] of [[admin, "admin-token"], [owner, "owner-token"]] as const) await ctx.db.insert("authSessions", { userId, principalType: "staff", version: 1, tokenHash: await hashTokenForLookup(token), createdAt: now, lastUsedAt: now, expiresAt: now + 86400000, idleExpiresAt: now + 86400000 });
    return { admin, owner };
  });
  const auth = { userId: admin, sessionToken: "admin-token" };
  return { t, auth, owner };
}
async function ready(t: ReturnType<typeof convexTest>, auth: any) {
  const runId = await t.mutation(functions.prepare, auth);
  let page;
  do { page = await t.mutation(functions.prepareNextPage, { ...auth, runId }); } while (!page.done);
  return { runId, ...page };
}
async function approve(t: ReturnType<typeof convexTest>, auth: any, run: any, mode: "test" | "production" = "production") {
  await t.mutation(functions.approve, { ...auth, runId: run.runId, expectedDigest: run.digest, approval: approvalPhrase(mode), confirmReadiness: true });
}

describe("campaign content and configuration", () => {
  it("preserves design and injects escaped private footer only into outgoing HTML/text", async () => {
    const c = configuration(); c.postalAddress = 'Synthetic <Address> & Company';
    const draft = preview("marketing");
    expect(draft.html).toContain("#064e3b"); expect(draft.html).toContain("FREESCRUB");
    expect(draft.html).not.toContain(c.postalAddress);
    const message = await outgoing("marketing", c, "a".repeat(64));
    expect(message.html).toContain("Synthetic &lt;Address&gt; &amp; Company");
    expect(message.text).toContain(c.postalAddress);
    expect(message.html).not.toContain("preview placeholder");
    expect(message.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(message.text).toContain("first subscription invoice after the trial is $0");
    expect(message.text).toContain("does not enter you into a future giveaway");
    expect((await outgoing("winner", c, "b".repeat(64))).text).toContain("Marketing preferences do not affect your prize");
  });
  it("fails closed on missing and unsafe configuration without echoing values", () => {
    for (const key of ["SCRUB_CAMPAIGN_REPLY_TO", "SCRUB_CAMPAIGN_POSTAL_ADDRESS", "SCRUB_CAMPAIGN_UNSUBSCRIBE_SECRET", "SCRUB_GIVEAWAY_WINNER_EMAIL", "RESEND_API_KEY"]) {
      const env = { ...process.env, [key]: "" }; expect(() => configuration(env)).toThrow();
    }
    expect(() => configuration({ ...process.env, SCRUB_CAMPAIGN_REPLY_TO: "invalid\r\nInjected" })).toThrow("SCRUB_CAMPAIGN_REPLY_TO");
  });
  it("requires strict Yes consent, valid evidence and excludes winner/duplicates/suppression", () => {
    const entry = sample("yes@example.test");
    expect(category(entry, winner, 1, false)).toBe("marketing");
    for (const value of [undefined, null, "Yes", "true", 1]) expect(category({ ...entry, marketingConsent: value }, winner, 1, false)).toBe("invalidConsent");
    expect(category({ ...entry, marketingConsent: false }, winner, 1, false)).toBe("noConsent");
    expect(category({ ...entry, marketingConsentAt: undefined }, winner, 1, false)).toBe("invalidConsent");
    expect(category(entry, winner, 2, false)).toBe("duplicate");
    expect(category(entry, winner, 1, true)).toBe("suppressed");
    expect(category(sample(winner, false), winner, 1, true)).toBe("winner");
    for (const time of [NaN, Infinity, -1, now + 1]) {
      expect(category({ ...entry, marketingConsentAt: time }, winner, 1, false)).toBe("invalidConsent");
      expect(category({ ...entry, eligibilityConfirmedAt: time }, winner, 1, false)).toBe("invalid");
    }
    expect(category({ ...entry, qualifiedAt: NaN }, winner, 1, false)).toBe("invalid");
  });
  it("keeps campaign identity stable across auth-key rotation and canonicalizes email", async () => {
    const original = await emailIdentity(" Yes@Example.test ");
    vi.stubEnv("TOKEN_PEPPER", "rotated-synthetic-auth-pepper");
    expect(await emailIdentity("yes@example.test")).toBe(original);
  });
});
describe("private snapshot and approval", () => {
  it("returns aggregate counts only, excludes winner/No/duplicates/suppression and scans all pages", async () => {
    const { t, auth } = await setup();
    await t.run(async ctx => {
      for (const entry of [sample(winner, false), sample("no@example.test", false), sample("duplicate@example.test"), sample(" DUPLICATE@example.test "), sample("suppressed@example.test")]) await ctx.db.insert("giveawayEntries", entry);
      for (let i = 0; i < 105; i++) await ctx.db.insert("giveawayEntries", sample(`yes${i}@example.test`));
    });
    await t.mutation(functions.suppress, { ...auth, email: "suppressed@example.test", reason: "manual" });
    const run = await ready(t, auth);
    expect(run.counts).toEqual({ total: 110, winner: 1, marketing: 105, noConsent: 1, duplicate: 2, suppressed: 1, invalid: 0, invalidConsent: 0 });
    const status = await t.query(functions.status, { ...auth, runId: run.runId });
    expect(JSON.stringify(status)).not.toContain("@example");
    expect(send).not.toHaveBeenCalled();
  });
  it("denies nonadmins, invalid sessions, stale digests and unapproved sends", async () => {
    const { t, auth, owner } = await setup();
    await expect(t.mutation(functions.prepare, { userId: owner, sessionToken: "owner-token" })).rejects.toThrow("Super admin");
    await expect(t.query(functions.designPreview, { ...auth, sessionToken: "invalid", template: "winner" })).rejects.toThrow();
    await t.run(ctx => ctx.db.insert("giveawayEntries", sample(winner)));
    const run = await ready(t, auth);
    await expect(t.mutation(functions.approve, { ...auth, runId: run.runId, expectedDigest: "wrong", approval: approvalPhrase("production"), confirmReadiness: true })).rejects.toThrow("approval");
    await expect(t.action(delivery.sendBatch, { ...auth, runId: run.runId, limit: 2 })).rejects.toThrow("not approved");
    await expect(t.action(delivery.sendBatch, { userId: owner, sessionToken: "owner-token", runId: run.runId, limit: 2 })).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
  it("blocks absent winner, changed config, expired approval, and disabled sends", async () => {
    const { t, auth } = await setup(); const noWinner = await ready(t, auth);
    await expect(approve(t, auth, noWinner)).rejects.toThrow("approval");
    await t.run(ctx => ctx.db.insert("giveawayEntries", sample(winner)));
    const run = await ready(t, auth);
    vi.stubEnv("SCRUB_CAMPAIGN_ALLOWED_SEND_MODE", "disabled");
    await expect(approve(t, auth, run)).rejects.toThrow("disabled");
    vi.stubEnv("SCRUB_CAMPAIGN_ALLOWED_SEND_MODE", "production"); await approve(t, auth, run);
    vi.setSystemTime(now + 3600001);
    await expect(t.action(delivery.sendBatch, { ...auth, runId: run.runId, limit: 1 })).rejects.toThrow("expired");
    vi.setSystemTime(now); vi.stubEnv("SCRUB_CAMPAIGN_REPLY_TO", "changed@example.test");
    await expect(t.action(delivery.sendBatch, { ...auth, runId: run.runId, limit: 1 })).rejects.toThrow("changed");
    expect(send).not.toHaveBeenCalled();
  });
  it.each([undefined, "", "disabled", "true", "TEST"])("cannot approve or deliver with send mode %s", async mode => {
    const { t, auth } = await setup(); await t.run(ctx => ctx.db.insert("giveawayEntries", sample(winner)));
    const run = await ready(t, auth); await approve(t, auth, run);
    vi.stubEnv("SCRUB_CAMPAIGN_ALLOWED_SEND_MODE", mode);
    await expect(t.action(delivery.sendBatch, { ...auth, runId: run.runId, limit: 2 })).rejects.toThrow("disabled");
    expect(send).not.toHaveBeenCalled();
    const second = await ready(t, auth);
    await expect(approve(t, auth, second)).rejects.toThrow("disabled");
    expect(send).not.toHaveBeenCalled();
  });
  it("cannot turn an incomplete snapshot into an approvable run via pause", async () => {
    const { t, auth } = await setup();
    const runId = await t.mutation(functions.prepare, auth);
    await expect(t.mutation(functions.pause, { ...auth, runId })).rejects.toThrow("approved delivery");
    await expect(t.mutation(functions.reviewPausedRun, { ...auth, runId })).rejects.toThrow();
    expect((await t.query(functions.status, { ...auth, runId })).state).toBe("preparing");
  });
  it("enforces admin permission for every public campaign control", async () => {
    const { t, auth, owner } = await setup(); await t.run(ctx => ctx.db.insert("giveawayEntries", sample(winner)));
    const run = await ready(t, auth);
    const recipientId = await t.run(async ctx => (await ctx.db.query("giveawayEmailRecipients").first())!._id);
    const bad = { userId: owner, sessionToken: "owner-token" };
    for (const [fn, args] of [
      [functions.status, { ...bad, runId: run.runId }],
      [functions.designPreview, { ...bad, template: "winner" }],
      [functions.ledgerPage, { ...bad, runId: run.runId, paginationOpts: { cursor: null, numItems: 5 } }],
    ] as const) await expect(t.query(fn, args)).rejects.toThrow("Super admin");
    for (const [fn, args] of [
      [functions.prepare, bad], [functions.prepareNextPage, { ...bad, runId: run.runId }],
      [functions.prepareTest, { ...bad, testEmail: "reviewer@example.test" }],
      [functions.approve, { ...bad, runId: run.runId, expectedDigest: run.digest, approval: approvalPhrase("production"), confirmReadiness: true }],
      [functions.pause, { ...bad, runId: run.runId }], [functions.reviewPausedRun, { ...bad, runId: run.runId }],
      [functions.suppress, { ...bad, email: "synthetic@example.test", reason: "manual" }],
      [functions.reconcileAccepted, { ...bad, runId: run.runId, recipientId, providerId: "provider-test-id", acceptedAt: now, evidenceReference: "synthetic-evidence" }],
    ] as const) await expect(t.mutation(fn, args)).rejects.toThrow("Super admin");
    expect(send).not.toHaveBeenCalled();
  });
});
describe("persistent opt-out", () => {
  it("uses the real Resend/Svix verifier and rejects tampered, stale or unsigned payloads", async () => {
    const { t } = await setup();
    const sdk = await vi.importActual<typeof import("resend")>("resend");
    const real = new sdk.Resend("synthetic-verification-only");
    verifyWebhook.mockImplementation(options => real.webhooks.verify(options));
    const key = Buffer.from("synthetic-webhook-key-not-for-production");
    vi.stubEnv("SCRUB_CAMPAIGN_RESEND_WEBHOOK_SECRET", `whsec_${key.toString("base64")}`);
    const payload = JSON.stringify({ type: "email.complained", data: { to: ["signed@example.test"] } });
    const id = "msg_synthetic"; const timestamp = String(now / 1000);
    const sign = (time: string) => `v1,${createHmac("sha256", key).update(`${id}.${time}.${payload}`).digest("base64")}`;
    const post = (body: string, time: string, signature: string) => t.fetch("/giveaway/resend-webhook", { method: "POST", body, headers: { "svix-id": id, "svix-timestamp": time, "svix-signature": signature } });
    expect((await post(payload + " ", timestamp, sign(timestamp))).status).toBe(401);
    const stale = String(now / 1000 - 600);
    expect((await post(payload, stale, sign(stale))).status).toBe(401);
    expect((await post(payload, timestamp, "")).status).toBe(401);
    expect(await t.run(ctx => ctx.db.query("marketingSuppressions").collect())).toHaveLength(0);
    expect((await post(payload, timestamp, sign(timestamp))).status).toBe(204);
    expect((await post(payload, timestamp, sign(timestamp))).status).toBe(204);
    const rows = await t.run(ctx => ctx.db.query("marketingSuppressions").collect());
    expect(rows).toHaveLength(1); expect(rows[0].emailHash).toBe(await emailIdentity("signed@example.test"));
    expect(send).not.toHaveBeenCalled();
  });
  it("bounds untrusted webhook bytes before signature verification", async () => {
    const { t } = await setup();
    expect((await t.fetch("/giveaway/resend-webhook", { method: "POST", body: "x".repeat(65537) })).status).toBe(413);
    expect(verifyWebhook).not.toHaveBeenCalled();
  });
  it("requires provider signature verification before recording bounce/complaint suppression", async () => {
    const { t } = await setup();
    vi.stubEnv("SCRUB_CAMPAIGN_RESEND_WEBHOOK_SECRET", "synthetic-webhook-secret");
    verifyWebhook.mockImplementationOnce(() => { throw new Error("invalid signature"); });
    expect((await t.fetch("/giveaway/resend-webhook", { method: "POST", body: "{}" })).status).toBe(401);
    expect(await t.run(ctx => ctx.db.query("marketingSuppressions").collect())).toHaveLength(0);
    verifyWebhook.mockReturnValue({ type: "email.complained", data: { to: ["complaint@example.test"] } });
    expect((await t.fetch("/giveaway/resend-webhook", { method: "POST", body: "{}", headers: { "svix-id": "signed-event", "svix-timestamp": "verified-time", "svix-signature": "verified-signature" } })).status).toBe(204);
    const suppressions = await t.run(ctx => ctx.db.query("marketingSuppressions").collect());
    expect(suppressions).toHaveLength(1); expect(suppressions[0].reason).toBe("provider");
    expect(verifyWebhook).toHaveBeenLastCalledWith(expect.objectContaining({ headers: { id: "signed-event", timestamp: "verified-time", signature: "verified-signature" } }));
    expect(send).not.toHaveBeenCalled();
  });
  it("verifies signed opaque links, GET does not suppress, POST persists and is idempotent", async () => {
    const { t } = await setup(); const hash = await emailIdentity("yes@example.test");
    const token = await unsubscribeToken(hash, configuration().secret);
    expect(token).not.toContain("yes@example");
    expect(await verifyUnsubscribe(token, configuration().secret)).toBe(hash);
    expect(await verifyUnsubscribe(token.slice(0, -1) + (token.endsWith("0") ? "1" : "0"), configuration().secret)).toBeNull();
    const path = `/giveaway/unsubscribe?token=${token}`;
    expect((await t.fetch(path)).status).toBe(200);
    expect(await t.run(ctx => ctx.db.query("marketingSuppressions").collect())).toHaveLength(0);
    expect((await t.fetch(path, { method: "POST" })).status).toBe(200);
    expect((await t.fetch(path, { method: "POST" })).status).toBe(200);
    expect(await t.run(ctx => ctx.db.query("marketingSuppressions").collect())).toHaveLength(1);
    expect((await t.fetch("/giveaway/unsubscribe?token=bad", { method: "POST" })).status).toBe(400);
  });
  it("honors opt-out and consent withdrawal after approval without suppressing prize notice", async () => {
    const { t, auth } = await setup();
    const ids = await t.run(async ctx => { await ctx.db.insert("giveawayEntries", sample(winner)); return [await ctx.db.insert("giveawayEntries", sample("optout@example.test")), await ctx.db.insert("giveawayEntries", sample("withdrawn@example.test"))]; });
    const run = await ready(t, auth); await approve(t, auth, run);
    await t.mutation(privateFunctions.unsubscribe, { emailHash: await emailIdentity(winner) });
    await t.mutation(privateFunctions.unsubscribe, { emailHash: await emailIdentity("optout@example.test") });
    await t.run(ctx => ctx.db.patch(ids[1], { marketingConsent: false }));
    for (let i = 0; i < 3; i++) await t.action(delivery.sendBatch, { ...auth, runId: run.runId, limit: 2 });
    expect(send).toHaveBeenCalledTimes(1); expect(send.mock.calls[0][0].to).toBe(winner);
  });
});
describe("delivery ledger and partial failures (mocked provider only)", () => {
  it("sends winner first, records 72-hour deadline, and prevents replay across snapshots", async () => {
    const { t, auth } = await setup(); await t.run(async ctx => { await ctx.db.insert("giveawayEntries", sample(winner)); await ctx.db.insert("giveawayEntries", sample("yes@example.test")); });
    const run = await ready(t, auth); await approve(t, auth, run);
    expect(await t.action(delivery.sendBatch, { ...auth, runId: run.runId, limit: 2 })).toEqual({ accepted: 2, stopped: false });
    expect(send.mock.calls.map(c => c[0].to)).toEqual([winner, "yes@example.test"]);
    expect(send.mock.calls[0][0]).toMatchObject({ from: "SCRUB Team <sender@example.test>", replyTo: "reply@example.test" });
    const rows = await t.run(ctx => ctx.db.query("giveawayEmailRecipients").collect());
    expect(rows.find(r => r.template === "winner")).toMatchObject({ acceptedAt: now, responseDeadline: now + 72 * 3600000 });
    expect(await t.action(delivery.sendBatch, { ...auth, runId: run.runId, limit: 2 })).toEqual({ accepted: 0, stopped: true });
    await expect(t.action(delivery.sendBatch, { ...auth, runId: run.runId, limit: 2 })).rejects.toThrow("not approved");
    expect(send).toHaveBeenCalledTimes(2);
    const second = await ready(t, auth); await approve(t, auth, second);
    for (let i = 0; i < 3; i++) await t.action(delivery.sendBatch, { ...auth, runId: second.runId, limit: 2 });
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("keeps prior suppressions and production send keys valid after session-pepper rotation", async () => {
    const { t, auth } = await setup();
    await t.run(async ctx => { for (const email of [winner, "yes@example.test", "blocked@example.test"]) await ctx.db.insert("giveawayEntries", sample(email)); });
    await t.mutation(functions.suppress, { ...auth, email: "blocked@example.test", reason: "manual" });
    const run = await ready(t, auth); await approve(t, auth, run);
    await t.action(delivery.sendBatch, { ...auth, runId: run.runId, limit: 2 });
    vi.stubEnv("TOKEN_PEPPER", "rotated-synthetic-auth-pepper");
    await t.run(async ctx => {
      const sessions = await ctx.db.query("authSessions").collect();
      for (const session of sessions) if (session.userId === auth.userId) await ctx.db.patch(session._id, { tokenHash: await hashTokenForLookup("admin-token") });
    });
    const second = await ready(t, auth); expect(second.counts.suppressed).toBe(1);
    await approve(t, auth, second);
    // Exercise the fresh V8 session/reservation boundary. The existing Node session
    // helper captures its pepper at module initialization until its runtime restarts.
    for (let i = 0; i < 3; i++) expect(await t.mutation(privateFunctions.reserve, { ...auth, runId: second.runId })).toBeNull();
    expect(send).toHaveBeenCalledTimes(2);
  });
  it.each(["timeout", "rejection", "server-error"])("pauses partial campaign after %s and never blindly retries", async kind => {
    const { t, auth } = await setup(); await t.run(async ctx => { for (const e of [winner, "one@example.test", "two@example.test"]) await ctx.db.insert("giveawayEntries", sample(e)); });
    const run = await ready(t, auth); await approve(t, auth, run);
    send.mockResolvedValueOnce({ data: { id: "winner-provider-id" }, error: null });
    if (kind === "timeout") send.mockRejectedValueOnce(new Error("synthetic network failure"));
    else send.mockResolvedValueOnce({ data: null, error: { statusCode: kind === "rejection" ? 422 : 500 } });
    expect(await t.action(delivery.sendBatch, { ...auth, runId: run.runId, limit: 3 })).toEqual({ accepted: 1, stopped: true });
    expect((await t.query(functions.status, { ...auth, runId: run.runId })).state).toBe("paused");
    await expect(t.action(delivery.sendBatch, { ...auth, runId: run.runId, limit: 3 })).rejects.toThrow("not approved");
    expect(send).toHaveBeenCalledTimes(2);
    const ledger = await t.run(ctx => ctx.db.query("giveawayEmailDeliveries").collect());
    expect(ledger.map(r => r.state)).toContain(kind === "rejection" ? "rejected" : "uncertain");
  });
  it("blocks concurrent reservation and recovers lost provider response only by explicit reconciliation", async () => {
    const { t, auth } = await setup(); await t.run(ctx => ctx.db.insert("giveawayEntries", sample(winner)));
    const run = await ready(t, auth); await approve(t, auth, run);
    const reserved = await t.mutation(privateFunctions.reserve, { ...auth, runId: run.runId });
    await expect(t.mutation(privateFunctions.reserve, { ...auth, runId: run.runId })).rejects.toThrow("unresolved");
    await t.mutation(functions.reconcileAccepted, { ...auth, runId: run.runId, recipientId: reserved.recipientId, providerId: "verified-provider-id", acceptedAt: now, evidenceReference: "private-ledger-reference" });
    expect((await t.query(functions.status, { ...auth, runId: run.runId })).state).toBe("ready");
    expect(send).not.toHaveBeenCalled();
  });
  it("can reconcile an interrupted reservation after configuration drift without authorizing sends", async () => {
    const { t, auth } = await setup(); await t.run(ctx => ctx.db.insert("giveawayEntries", sample(winner)));
    const run = await ready(t, auth); await approve(t, auth, run);
    const reserved = await t.mutation(privateFunctions.reserve, { ...auth, runId: run.runId });
    vi.stubEnv("RESEND_API_KEY", "rotated-synthetic-key");
    await t.mutation(functions.reconcileAccepted, { ...auth, runId: run.runId, recipientId: reserved.recipientId, providerId: "verified-provider-id", acceptedAt: now, evidenceReference: "synthetic-provider-evidence" });
    expect((await t.query(functions.status, { ...auth, runId: run.runId })).state).toBe("ready");
    await expect(approve(t, auth, run)).rejects.toThrow("changed");
    expect(send).not.toHaveBeenCalled();
  });
  it("rejects pause recovery until unresolved deliveries are reconciled", async () => {
    const { t, auth } = await setup(); await t.run(ctx => ctx.db.insert("giveawayEntries", sample(winner)));
    const run = await ready(t, auth); await approve(t, auth, run);
    await t.mutation(functions.pause, { ...auth, runId: run.runId });
    await t.mutation(functions.reviewPausedRun, { ...auth, runId: run.runId });
    expect((await t.query(functions.status, { ...auth, runId: run.runId })).state).toBe("ready");
    await approve(t, auth, run);
    await t.mutation(privateFunctions.reserve, { ...auth, runId: run.runId });
    await t.mutation(functions.pause, { ...auth, runId: run.runId });
    await expect(t.mutation(functions.reviewPausedRun, { ...auth, runId: run.runId })).rejects.toThrow("reconciliation");
    expect(send).not.toHaveBeenCalled();
  });
  it("allows synthetic test addresses only after independent test approval and mode gate", async () => {
    const { t, auth } = await setup();
    await expect(t.mutation(functions.prepareTest, { ...auth, testEmail: winner })).rejects.toThrow();
    await t.run(ctx => ctx.db.insert("giveawayEntries", sample("participant@example.test")));
    vi.stubEnv("SCRUB_CAMPAIGN_TEST_RECIPIENTS", "participant@example.test,reviewer@example.test");
    await expect(t.mutation(functions.prepareTest, { ...auth, testEmail: "participant@example.test" })).rejects.toThrow("Participant");
    const runId = await t.mutation(functions.prepareTest, { ...auth, testEmail: "reviewer@example.test" });
    const run = await t.query(functions.status, { ...auth, runId });
    await expect(approve(t, auth, { runId, ...run }, "test")).rejects.toThrow("disabled");
    vi.stubEnv("SCRUB_CAMPAIGN_ALLOWED_SEND_MODE", "test");
    await approve(t, auth, { runId, ...run }, "test");
    await t.action(delivery.sendBatch, { ...auth, runId, limit: 2 });
    expect(send).toHaveBeenCalledTimes(2); expect(send.mock.calls.every(c => c[0].to === "reviewer@example.test")).toBe(true);
  });
});
