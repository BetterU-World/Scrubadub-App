import { beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";
import { getJobPrimaryStatus, getPartnerResponseStatus } from "../../../packages/frontend/src/lib/partnerJobStatus";

const modules = import.meta.glob("../../**/*.ts");

describe("partner shared-job email", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.APP_URL = "https://app.scrub.test/";
    process.env.TOKEN_PEPPER = "partner-email-test-pepper";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "test@scrub.test";
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
  });

  it("renders canonical partner response state as the primary list badge", () => {
    expect(getJobPrimaryStatus({ status: "scheduled", sharedFromJobId: "original", partnerResponseStatus: "pending" })).toBe("pending");
    expect(getJobPrimaryStatus({ status: "cancelled", sharedFromJobId: "original", partnerResponseStatus: "rejected" })).toBe("rejected");
    expect(getJobPrimaryStatus({ status: "scheduled", sharedFromJobId: "original", partnerResponseStatus: "accepted" })).toBe("accepted");
    expect(getJobPrimaryStatus({ status: "confirmed", partnerResponseStatus: "rejected" })).toBe("rejected");
    expect(getPartnerResponseStatus(["accepted", "rejected"])).toBe("rejected");
    expect(getJobPrimaryStatus({ status: "scheduled" })).toBe("scheduled");
  });

  it("shares only through an active relationship and notifies only active Owners", async () => {
    const t = convexTest(schema, modules);
    const passwordHash = await hashPassword("test-password-123");
    const seeded = await t.run(async (ctx) => {
      const companyA = await ctx.db.insert("companies", { name: "Company A", timezone: "America/New_York", subscriptionStatus: "active" });
      const companyB = await ctx.db.insert("companies", { name: "Company B", timezone: "America/Chicago", contactEmail: "contact@b.test" });
      const companyC = await ctx.db.insert("companies", { name: "Company C", timezone: "UTC" });
      const ownerA = await ctx.db.insert("users", { email: "owner@a.test", passwordHash, name: "Owner A", companyId: companyA, role: "owner", status: "active" });
      const activeB = await ctx.db.insert("users", { email: "oldest@b.test", passwordHash, name: "Active B", companyId: companyB, role: "owner", status: "active" });
      await ctx.db.insert("users", { email: "inactive@b.test", passwordHash, name: "Inactive B", companyId: companyB, role: "owner", status: "inactive" });
      await ctx.db.insert("users", { email: "manager@b.test", passwordHash, name: "Manager B", companyId: companyB, role: "manager", status: "active" });
      await ctx.db.insert("ownerConnections", { companyAId: companyA, companyBId: companyB, status: "active", initiatorCompanyId: companyA, createdAt: Date.now() });
      const propertyId = await ctx.db.insert("properties", { companyId: companyA, name: "Beach <House>", type: "residential", address: "1 Ocean Ave", amenities: [], active: true });
      const jobId = await ctx.db.insert("jobs", { companyId: companyA, propertyId, cleanerIds: [], type: "deep_clean", status: "scheduled", scheduledDate: "2026-08-12", startTime: "09:30", durationMinutes: 90, notes: "Use side door", reworkCount: 0 });
      return { companyB, companyC, ownerA, activeB, jobId };
    });
    const auth = await t.action(api.authActions.signIn, { email: "owner@a.test", password: "test-password-123" });

    const shared = await t.mutation(api.mutations.partners.shareJob, { userId: seeded.ownerA, sessionToken: auth.sessionToken, jobId: seeded.jobId, toCompanyId: seeded.companyB, sharePackage: true });
    const state = await t.run(async (ctx) => ({
      copied: await ctx.db.get(shared.copiedJobId),
      bridge: await ctx.db.get(shared.sharedJobId),
      notifications: await ctx.db.query("notifications").collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(state.copied).toMatchObject({ companyId: seeded.companyB, sharedFromJobId: seeded.jobId, status: "scheduled" });
    expect(state.bridge).toMatchObject({ status: "pending", copiedJobId: shared.copiedJobId });
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]).toMatchObject({ userId: seeded.activeB, type: "job_shared", relatedJobId: shared.copiedJobId });
    expect(state.scheduled).toHaveLength(1);
    expect(JSON.stringify(state.scheduled[0])).toContain("oldest@b.test");
    expect(JSON.stringify(state.scheduled[0])).toContain(String(shared.copiedJobId));

    const authB = await t.action(api.authActions.signIn, { email: "oldest@b.test", password: "test-password-123" });
    await t.query(api.queries.jobs.get, { jobId: shared.copiedJobId, userId: seeded.activeB, sessionToken: authB.sessionToken });
    await t.query(api.queries.partners.getIncomingSharedStatus, { copiedJobId: shared.copiedJobId, userId: seeded.activeB, sessionToken: authB.sessionToken });
    const stillPending = await t.run(async (ctx) => ctx.db.get(shared.sharedJobId));
    expect(stillPending?.status).toBe("pending");
    const beforeResponse = await t.query(api.queries.jobs.list, { companyId: seeded.companyB, userId: seeded.activeB, sessionToken: authB.sessionToken });
    expect(beforeResponse[0]).toMatchObject({ _id: shared.copiedJobId, status: "scheduled", partnerResponseStatus: "pending" });
    await expect(t.mutation(api.mutations.partners.acceptSharedJob, { userId: seeded.ownerA, sessionToken: auth.sessionToken, sharedJobId: shared.sharedJobId })).rejects.toThrow("Not authorized");

    await t.mutation(api.mutations.partners.rejectSharedJob, { userId: seeded.activeB, sessionToken: authB.sessionToken, sharedJobId: shared.sharedJobId });
    const afterReject = await t.query(api.queries.jobs.list, { companyId: seeded.companyB, userId: seeded.activeB, sessionToken: authB.sessionToken });
    expect(afterReject[0]).toMatchObject({ _id: shared.copiedJobId, status: "cancelled", partnerResponseStatus: "rejected" });
    await expect(t.query(api.queries.partners.getIncomingSharedStatus, { copiedJobId: shared.copiedJobId, userId: seeded.activeB, sessionToken: authB.sessionToken })).resolves.toMatchObject({ status: "rejected" });
    await expect(t.query(api.queries.partners.getSharedJobStatus, { jobId: seeded.jobId, userId: seeded.ownerA, sessionToken: auth.sessionToken })).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ status: "rejected" })]));
    await expect(t.query(api.queries.partners.listIncomingSharedJobs, { userId: seeded.activeB, sessionToken: authB.sessionToken })).resolves.toHaveLength(0);
    await expect(t.mutation(api.mutations.partners.rejectSharedJob, { userId: seeded.activeB, sessionToken: authB.sessionToken, sharedJobId: shared.sharedJobId })).rejects.toThrow("Shared job is not pending");

    await expect(t.mutation(api.mutations.partners.shareJob, { userId: seeded.ownerA, sessionToken: auth.sessionToken, jobId: seeded.jobId, toCompanyId: seeded.companyC, sharePackage: false })).rejects.toThrow("Not connected to this company");
    await expect(t.mutation(api.mutations.partners.shareJob, { userId: seeded.ownerA, sessionToken: auth.sessionToken, jobId: seeded.jobId, toCompanyId: seeded.companyB, sharePackage: false })).rejects.toThrow("Job already shared to this company");
  });

  async function render(overrides: Record<string, unknown> = {}) {
    const { renderPartnerSharedJobEmail } = await import("../email");
    return renderPartnerSharedJobEmail({
      email: "owner@partner.test",
      fromCompanyName: "Company A",
      toCompanyName: "Company B",
      propertyName: "Beach House",
      serviceType: "deep_clean",
      scheduledDate: "2026-08-12",
      startTime: "09:30",
      durationMinutes: 90,
      notes: "Use side door",
      copiedJobId: "job-b-copy",
      timezone: "America/New_York",
      ...overrides,
    });
  }

  it("renders the authorized copied-job details and direct Company B link", async () => {
    const message = await render();
    expect(message.subject).toBe("New shared job from Company A — Beach House");
    expect(message.html).toContain("Company B received a shared deep clean job");
    expect(message.html).toContain("Beach House");
    expect(message.html).toContain("09:30–11:00 (America/New_York)");
    expect(message.html).toContain("Use side door");
    expect(message.html).toContain('href="https://app.scrub.test/jobs/job-b-copy"');
    expect(message.html).toContain("Response required");
    expect(message.html).toContain("If the button does not work, open this link:");
    expect(message.text).toContain("Review Shared Job: https://app.scrub.test/jobs/job-b-copy");
    expect(message).not.toHaveProperty("headers");
  });

  it("renders Spanish action copy when a supported language is available", async () => {
    const message = await render({ language: "es" });
    expect(message.subject).toBe("Nuevo trabajo compartido de Company A — Beach House");
    expect(message.html).toContain("compartió un trabajo con tu empresa");
    expect(message.html).toContain("Respuesta requerida");
    expect(message.html).toContain("Revisar trabajo compartido");
    expect(message.html).toContain("Si el botón no funciona, abre este enlace:");
    expect(message.text).toContain("https://app.scrub.test/jobs/job-b-copy");
  });

  it("escapes untrusted display fields and strips subject newlines", async () => {
    const message = await render({
      fromCompanyName: "Company <A>\r\nBcc: bad@example.test",
      propertyName: '<img src=x onerror="bad">',
      notes: "<script>bad()</script>\nSafe line",
    });
    expect(message.subject).not.toContain("\n");
    expect(message.html).not.toContain("<script>");
    expect(message.html).not.toContain("<img src=x");
    expect(message.html).toContain("&lt;script&gt;bad()&lt;/script&gt;<br />Safe line");
  });

  it("keeps the CTA and direct URL when optional time and notes are absent", async () => {
    const message = await render({ startTime: undefined, notes: undefined });
    expect(message.html).toContain("Review Shared Job");
    expect(message.html).toContain("https://app.scrub.test/jobs/job-b-copy");
    expect(message.text).toContain("https://app.scrub.test/jobs/job-b-copy");
  });
});
