import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { hashToken } from "../tokens";

const modules = import.meta.glob("../../**/*.ts");
const onboarding = api.ownerOnboarding;
const send = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));

function backend() {
  return convexTest(schema, modules);
}

async function session(t: ReturnType<typeof backend>, userId: Id<"users">, token: string) {
  const now = Date.now();
  await t.run((ctx) => ctx.db.insert("authSessions", {
    principalType: "staff", userId, version: 1, tokenHash: hashToken(token),
    createdAt: now, lastUsedAt: now, expiresAt: now + 60_000, idleExpiresAt: now + 60_000,
  }));
  return token;
}

async function existingOwner(t: ReturnType<typeof backend>, name: string, role: "owner" | "manager" = "owner") {
  const { companyId, userId } = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name, timezone: "UTC", subscriptionStatus: "active" });
    const userId = await ctx.db.insert("users", {
      companyId, role, name, email: `${name}@example.test`, passwordHash: "unused", status: "active",
    });
    return { companyId, userId };
  });
  return { companyId, sessionToken: await session(t, userId, `session-${name}`), userId };
}

beforeEach(() => {
  vi.stubEnv("TOKEN_PEPPER", "test-token-pepper");
  vi.stubEnv("SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS", "true");
  vi.stubEnv("RESEND_API_KEY", "test");
  vi.stubEnv("RESEND_FROM_EMAIL", "verified@example.test");
  vi.stubEnv("APP_URL", "https://scrub.example.test");
  send.mockReset().mockResolvedValue({ data: { id: "email-test" }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("owner onboarding preferences and canonical progress", () => {
  it("sets the welcome cohort through direct signup and first checkout provisioning", async () => {
    const t = backend();
    const direct = await t.action(api.authActions.signUp, {
      email: "direct@example.test", password: "new-owner-password-123", name: "New owner", companyName: "First Clean",
    });
    const directSession = { companyId: direct.companyId, sessionToken: direct.sessionToken };
    expect(await t.query(onboarding.preferences, directSession)).toEqual({ companyId: direct.companyId, cohort: "signup" });
    await t.mutation(onboarding.updatePreferences, { ...directSession, change: { kind: "skipWelcome" } });
    expect(await t.query(onboarding.preferences, directSession)).toMatchObject({ welcomeHandled: true });

    const checkout = {
      stripeCheckoutSessionId: "cs_onboarding", stripeCustomerId: "cus_onboarding", stripeSubscriptionId: "sub_onboarding",
      stripePriceId: "price_onboarding", subscriptionStatus: "active", email: "checkout@example.test",
      passwordHash: "unused", name: "Checkout Owner", companyName: "Second Clean", timezone: "UTC",
    };
    const provisioned = await t.mutation(internal.authInternal.provisionPublicCheckout, checkout);
    const checkoutSession = { companyId: provisioned.companyId, sessionToken: await session(t, provisioned.userId, "checkout-device") };
    expect(await t.query(onboarding.preferences, checkoutSession)).toMatchObject({ cohort: "signup" });
    await t.mutation(onboarding.updatePreferences, { ...checkoutSession, change: { kind: "setGoal", goal: "schedule" } });
    await t.mutation(internal.authInternal.provisionPublicCheckout, checkout);
    expect(await t.query(onboarding.preferences, checkoutSession)).toMatchObject({ cohort: "signup", welcomeHandled: true, goal: "schedule" });
  });

  it("keeps empty legacy accounts eligible only for the announcement and scopes repeatable changes across devices", async () => {
    const t = backend();
    const { userId, ...firstDevice } = await existingOwner(t, "legacy");
    const { userId: _, ...otherOwner } = await existingOwner(t, "other");
    const { userId: __, ...manager } = await existingOwner(t, "manager", "manager");
    const secondDevice = { ...firstDevice, sessionToken: await session(t, userId, "other-legacy-device") };
    const legacy = { companyId: firstDevice.companyId, cohort: "existing" };
    expect(await t.query(onboarding.preferences, firstDevice)).toEqual(legacy);
    expect(await t.query(onboarding.progress, firstDevice)).toEqual({ propertyId: null, jobId: null, cleaner: null, invitation: null });
    for (const change of [
      { kind: "dismissAnnouncement" }, { kind: "setGoal", goal: "invite" },
      { kind: "dismissDashboard" }, { kind: "dismissAnnouncement" },
    ] as const) await t.mutation(onboarding.updatePreferences, { ...firstDevice, change });
    expect(await t.query(onboarding.preferences, secondDevice)).toEqual({
      ...legacy, announcementDismissed: true, dashboardDismissed: true, goal: "invite",
    });
    expect(await t.query(onboarding.preferences, otherOwner)).toEqual({ companyId: otherOwner.companyId, cohort: "existing" });
    const crossTenant = { ...firstDevice, companyId: otherOwner.companyId };
    await expect(t.query(onboarding.preferences, crossTenant)).rejects.toThrow("Access denied");
    await expect(t.query(onboarding.progress, crossTenant)).rejects.toThrow("Access denied");
    await expect(t.mutation(onboarding.updatePreferences, {
      ...crossTenant, change: { kind: "setGoal", goal: "schedule" },
    })).rejects.toThrow("Access denied");
    await expect(t.query(onboarding.preferences, manager)).rejects.toThrow("Owner session required");
    await expect(t.mutation(onboarding.updatePreferences, {
      ...manager, change: { kind: "dismissAnnouncement" },
    })).rejects.toThrow("Owner session required");
  });

  it("derives property and cleaning progress from successful Quick Job and full scheduling writes", async () => {
    const t = backend();
    const { userId, ...args } = await existingOwner(t, "scheduler");
    const schedule = { ...args, userId, cleanerIds: [], type: "standard", scheduledDate: "2026-12-01", durationMinutes: 60 } as const;
    const jobInput = { ...schedule, cleanerIds: [] };
    const newProperty = { address: "1 Main Street", type: "residential" } as const;
    await expect(t.mutation(api.mutations.jobs.createQuick, {
      ...jobInput, newProperty, durationMinutes: 0,
    })).rejects.toThrow("Invalid job schedule");
    expect(await t.query(onboarding.progress, args)).toMatchObject({ jobId: null, propertyId: null });

    const quick = await t.mutation(api.mutations.jobs.createQuick, { ...jobInput, newProperty });
    const firstWin = await t.query(onboarding.progress, args);
    expect(firstWin).toMatchObject({ jobId: quick, propertyId: expect.any(String) });
    await t.run((ctx) => ctx.db.patch(quick, { status: "cancelled" }));
    await t.mutation(api.mutations.jobs.create, { ...jobInput, propertyId: firstWin.propertyId!, type: "maintenance" });
    expect(await t.query(onboarding.progress, args)).toMatchObject({ jobId: null, propertyId: firstWin.propertyId });
    const full = await t.mutation(api.mutations.jobs.create, { ...jobInput, propertyId: firstWin.propertyId! });
    expect(await t.query(onboarding.progress, args)).toMatchObject({ jobId: full });
    const { userId: _, ...otherOwner } = await existingOwner(t, "other-tenant");
    expect(await t.query(onboarding.progress, otherOwner)).toMatchObject({ jobId: null, propertyId: null });
  });

  it("separates a cleaner invite, provider acceptance and joining, and respects revocation and expiry", async () => {
    const t = backend();
    const { userId, ...args } = await existingOwner(t, "inviter");
    const email = "cleaner@example.test";
    const query = () => t.query(onboarding.progress, args);
    await expect(t.action(api.employeeActions.inviteCleaner, { ...args, userId, email: "invalid", name: "Cleaner" })).rejects.toThrow();
    expect(await query()).toMatchObject({ cleaner: null, invitation: null });
    const invite = await t.action(api.employeeActions.inviteCleaner, { ...args, userId, email, name: "Cleaner" });
    expect(invite.emailSent).toBe(false);
    expect(await query()).toMatchObject({ cleaner: null, invitation: { emailSent: false } });

    vi.stubEnv("SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS", "false");
    send.mockResolvedValueOnce({ error: { message: "not accepted" } });
    await t.action(internal.actions.emailNotifications.sendInvite, { email, inviteToken: invite.token });
    expect(await query()).toMatchObject({ cleaner: null, invitation: { emailSent: false } });
    await t.action(internal.actions.emailNotifications.sendInvite, { email, inviteToken: invite.token });
    expect(await query()).toMatchObject({ cleaner: null, invitation: { emailSent: true } });
    vi.stubEnv("SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS", "true");

    const newToken = "current-invite-token";
    const expiresAt = Date.now() - 1;
    await t.mutation(internal.authInternal.rotateInviteToken, {
      userId: invite.userId, inviteTokenHash: hashToken(newToken), inviteTokenExpiry: expiresAt,
    });
    await t.mutation(internal.ownerOnboarding.recordCleanerInviteEmailSent, { tokenHash: hashToken(invite.token) });
    expect(await query()).toMatchObject({ cleaner: null, invitation: { emailSent: false, expiresAt } });
    await t.mutation(internal.authInternal.revokeInviteToken, { userId: invite.userId });
    expect(await query()).toMatchObject({ cleaner: null, invitation: null });

    const accepted = await t.action(api.employeeActions.inviteCleaner, {
      ...args, userId, email: "second-cleaner@example.test", name: "Second Cleaner",
    });
    await t.action(api.employeeActions.acceptInvite, { token: accepted.token, password: "cleaner-password-123" });
    expect(await query()).toMatchObject({ cleaner: "joined", invitation: null });
  });
});
