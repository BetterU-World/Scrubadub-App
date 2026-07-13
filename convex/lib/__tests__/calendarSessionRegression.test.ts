import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "test-password-123";

describe("calendar verified-session regression", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "test-token-pepper";
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
  });

  it("preserves owner/manager calendars and scopes cleaner/maintenance calendars", async () => {
    const t = convexTest(schema, modules);
    const passwordHash = await hashPassword(PASSWORD);
    const seeded = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Calendar Co", timezone: "America/New_York" });
      const owner = await ctx.db.insert("users", { email: "calendar-owner@test.dev", passwordHash, name: "Owner", companyId, role: "owner", status: "active" });
      const manager = await ctx.db.insert("users", { email: "calendar-manager@test.dev", passwordHash, name: "Manager", companyId, role: "manager", status: "active", canSeeAllJobs: true });
      const cleaner = await ctx.db.insert("users", { email: "calendar-cleaner@test.dev", passwordHash, name: "Cleaner", companyId, role: "cleaner", status: "active" });
      const maintenance = await ctx.db.insert("users", { email: "calendar-maintenance@test.dev", passwordHash, name: "Maintenance", companyId, role: "maintenance", status: "active" });
      const otherCleaner = await ctx.db.insert("users", { email: "calendar-other@test.dev", passwordHash, name: "Other", companyId, role: "cleaner", status: "active" });
      const propertyId = await ctx.db.insert("properties", { companyId, name: "Property", type: "residential", address: "1 Main", amenities: [], active: true });
      await ctx.db.insert("jobs", { companyId, propertyId, cleanerIds: [cleaner], type: "standard", status: "scheduled", scheduledDate: "2026-07-12", durationMinutes: 60, reworkCount: 0 });
      await ctx.db.insert("jobs", { companyId, propertyId, cleanerIds: [maintenance], type: "maintenance", status: "scheduled", scheduledDate: "2026-07-13", durationMinutes: 60, reworkCount: 0 });
      await ctx.db.insert("jobs", { companyId, propertyId, cleanerIds: [otherCleaner], type: "standard", status: "scheduled", scheduledDate: "2026-07-14", durationMinutes: 60, reworkCount: 0 });
      return { companyId, owner, manager, cleaner, maintenance };
    });

    const calendar = (userId: typeof seeded.owner, sessionToken: string) =>
      t.query(api.queries.jobs.getCalendarJobs, {
        companyId: seeded.companyId,
        userId,
        sessionToken,
        startDate: "2026-07-01",
        endDate: "2026-07-31",
      });
    const login = (email: string) => t.action(api.authActions.signIn, { email, password: PASSWORD });

    const ownerSession = await login("calendar-owner@test.dev");
    await expect(calendar(seeded.owner, ownerSession.sessionToken)).resolves.toHaveLength(3);
    const managerSession = await login("calendar-manager@test.dev");
    await expect(calendar(seeded.manager, managerSession.sessionToken)).resolves.toHaveLength(3);
    const cleanerSession = await login("calendar-cleaner@test.dev");
    await expect(calendar(seeded.cleaner, cleanerSession.sessionToken)).resolves.toHaveLength(1);
    const maintenanceSession = await login("calendar-maintenance@test.dev");
    await expect(calendar(seeded.maintenance, maintenanceSession.sessionToken)).resolves.toHaveLength(1);
    await expect(calendar(seeded.cleaner, "")).rejects.toThrow("verified session is required");
  });
});
