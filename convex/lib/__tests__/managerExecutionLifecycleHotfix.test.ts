import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "test-password-123";

async function login(t: ReturnType<typeof convexTest>, email: string) {
  return await t.action(api.authActions.signIn, { email, password: PASSWORD });
}

describe("manager execution lifecycle hotfix", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "manager-lifecycle-pepper";
    process.env.STRIPE_SECRET_KEY = "test";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test";
    process.env.RESEND_API_KEY = "test";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
  });

  it("runs the sole-manager workflow through shared evidence, owner approval, and client projection", async () => {
    const t = convexTest(schema, modules);
    const passwordHash = await hashPassword(PASSWORD);
    const seeded = await t.run(async (ctx) => {
      const company = await ctx.db.insert("companies", { name: "Lifecycle Co", timezone: "America/New_York" });
      const owner = await ctx.db.insert("users", { email: "owner@lifecycle.test", passwordHash, name: "Owner", companyId: company, role: "owner", status: "active" });
      const manager = await ctx.db.insert("users", { email: "manager@lifecycle.test", passwordHash, name: "Manager", companyId: company, role: "manager", status: "active", canSeeAllJobs: false });
      const client = await ctx.db.insert("clientUsers", { email: "client@lifecycle.test", passwordHash, displayName: "Client", status: "active", createdAt: 1, updatedAt: 1 });
      const relationship = await ctx.db.insert("clientRelationships", { companyId: company, clientUserId: client, displayName: "Client", clientType: "residential", status: "active", createdAt: 1, updatedAt: 1 });
      const property = await ctx.db.insert("properties", { companyId: company, clientRelationshipId: relationship, name: "Home", type: "residential", address: "1 Main", amenities: [], active: true, inventoryItems: [{ name: "Soap", category: "Supplies", parLevel: 2, required: true, currentQty: 1 }] });
      const job = await ctx.db.insert("jobs", { companyId: company, clientRelationshipId: relationship, propertyId: property, cleanerIds: [manager], type: "standard", status: "confirmed", scheduledDate: "2026-08-10", durationMinutes: 60, reworkCount: 0 });
      return { company, owner, manager, client, job };
    });

    const managerAuth = await login(t, "manager@lifecycle.test");
    const ownerAuth = await login(t, "owner@lifecycle.test");
    const clientAuth = await t.action(api.clientAuthActions.signIn, { email: "client@lifecycle.test", password: PASSWORD });
    await t.run(async (ctx) => {
      await ctx.db.patch(seeded.manager, { email: "" });
      await ctx.db.patch(seeded.owner, { email: "" });
    });

    const visible = await t.query(api.queries.jobs.getForManager, { companyId: seeded.company, userId: seeded.manager, sessionToken: managerAuth.sessionToken });
    expect(visible.map((job) => job._id)).toEqual([seeded.job]);
    expect(new Set(visible.map((job) => String(job._id))).size).toBe(visible.length);

    await t.mutation(api.mutations.jobs.startJob, { jobId: seeded.job, userId: seeded.manager, sessionToken: managerAuth.sessionToken });
    await t.mutation(api.mutations.jobs.pauseJob, { jobId: seeded.job, reason: "supplies", userId: seeded.manager, sessionToken: managerAuth.sessionToken });
    await t.mutation(api.mutations.jobs.resumeJob, { jobId: seeded.job, userId: seeded.manager, sessionToken: managerAuth.sessionToken });
    await t.mutation(api.mutations.jobs.updateInventoryChecklistItem, { jobId: seeded.job, itemName: "Soap", status: "restocked", reportedQty: 2, userId: seeded.manager, sessionToken: managerAuth.sessionToken });

    const form = await t.run((ctx) => ctx.db.query("forms").withIndex("by_jobId", (q) => q.eq("jobId", seeded.job)).unique());
    expect(form?.cleanerId).toBe(seeded.manager);
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["evidence"], { type: "text/plain" })));
    await t.mutation(api.mutations.forms.addPhoto, { formId: form!._id, photoStorageId: storageId, userId: seeded.manager, sessionToken: managerAuth.sessionToken });
    await t.mutation(api.mutations.forms.markAllComplete, { formId: form!._id, userId: seeded.manager, sessionToken: managerAuth.sessionToken });
    await t.mutation(api.mutations.forms.submit, { formId: form!._id, userId: seeded.manager, sessionToken: managerAuth.sessionToken });
    await t.mutation(api.mutations.jobs.completeJob, { jobId: seeded.job, notes: "Done", userId: seeded.manager, sessionToken: managerAuth.sessionToken });

    await t.mutation(api.mutations.inspections.submit, { jobId: seeded.job, readinessScore: 9, severity: "none", userId: seeded.manager, sessionToken: managerAuth.sessionToken });
    await expect(t.mutation(api.mutations.forms.approve, { formId: form!._id, userId: seeded.manager, sessionToken: managerAuth.sessionToken })).rejects.toThrow("Owner session required");
    await t.mutation(api.mutations.forms.approve, { formId: form!._id, userId: seeded.owner, sessionToken: ownerAuth.sessionToken });
    await expect(t.mutation(api.mutations.forms.approve, { formId: form!._id, userId: seeded.owner, sessionToken: ownerAuth.sessionToken })).resolves.toBeNull();

    const final = await t.run(async (ctx) => ({ job: await ctx.db.get(seeded.job), form: await ctx.db.get(form!._id), payments: await ctx.db.query("cleanerPayments").collect() }));
    expect(final.job).toMatchObject({ status: "approved", inspectionCycleOpen: false, inventoryChecklist: [{ name: "Soap", status: "restocked", reportedQty: 2 }] });
    expect(final.form).toMatchObject({ status: "approved", photoStorageIds: [storageId] });
    expect(final.payments).toHaveLength(0);

    const home = await t.query(api.queries.clientHome.getClientHome, { clientUserId: seeded.client, sessionToken: clientAuth.sessionToken });
    expect(home.completedJobs).toEqual(expect.arrayContaining([expect.objectContaining({ _id: seeded.job, status: "approved" })]));
  });

  it("shares one job, form, and inventory checklist when manager and cleaner are both assigned", async () => {
    const t = convexTest(schema, modules);
    const passwordHash = await hashPassword(PASSWORD);
    const seeded = await t.run(async (ctx) => {
      const company = await ctx.db.insert("companies", { name: "Shared Co", timezone: "America/New_York" });
      const manager = await ctx.db.insert("users", { email: "manager@shared.test", passwordHash, name: "Manager", companyId: company, role: "manager", status: "active", canSeeAllJobs: true });
      const cleaner = await ctx.db.insert("users", { email: "cleaner@shared.test", passwordHash, name: "Cleaner", companyId: company, role: "cleaner", status: "active" });
      const property = await ctx.db.insert("properties", { companyId: company, name: "Shared Home", type: "residential", address: "2 Main", amenities: [], active: true, inventoryItems: [{ name: "Towels", category: "Linens", parLevel: 4, required: true }] });
      const job = await ctx.db.insert("jobs", { companyId: company, propertyId: property, cleanerIds: [manager, cleaner], type: "standard", status: "confirmed", scheduledDate: "2026-08-11", durationMinutes: 60, reworkCount: 0 });
      return { company, manager, cleaner, job };
    });
    const managerAuth = await login(t, "manager@shared.test");
    const cleanerAuth = await login(t, "cleaner@shared.test");
    await t.mutation(api.mutations.jobs.startJob, { jobId: seeded.job, userId: seeded.manager, sessionToken: managerAuth.sessionToken });
    const firstForm = await t.run((ctx) => ctx.db.query("forms").withIndex("by_jobId", (q) => q.eq("jobId", seeded.job)).unique());
    const cleanerFormId = await t.mutation(api.mutations.forms.createFromTemplate, { jobId: seeded.job, companyId: seeded.company, cleanerId: seeded.cleaner, sessionToken: cleanerAuth.sessionToken });
    expect(cleanerFormId).toBe(firstForm!._id);

    await t.mutation(api.mutations.jobs.updateInventoryChecklistItem, { jobId: seeded.job, itemName: "Towels", status: "low", userId: seeded.cleaner, sessionToken: cleanerAuth.sessionToken });
    await t.mutation(api.mutations.jobs.updateInventoryChecklistItem, { jobId: seeded.job, itemName: "Towels", status: "restocked", reportedQty: 4, userId: seeded.manager, sessionToken: managerAuth.sessionToken });
    const state = await t.run(async (ctx) => ({ forms: await ctx.db.query("forms").withIndex("by_jobId", (q) => q.eq("jobId", seeded.job)).collect(), job: await ctx.db.get(seeded.job) }));
    expect(state.forms).toHaveLength(1);
    expect(state.job?.inventoryChecklist).toEqual([expect.objectContaining({ name: "Towels", status: "restocked", reportedQty: 4 })]);
    const managerProjection = await t.query(api.queries.jobs.getForManager, { companyId: seeded.company, userId: seeded.manager, sessionToken: managerAuth.sessionToken });
    expect(managerProjection.filter((job) => job._id === seeded.job)).toHaveLength(1);
  });

  it("preserves the same canonical submit-to-approval result for a cleaner executor", async () => {
    const t = convexTest(schema, modules);
    const passwordHash = await hashPassword(PASSWORD);
    const seeded = await t.run(async (ctx) => {
      const company = await ctx.db.insert("companies", { name: "Cleaner Approval Co", timezone: "America/New_York" });
      const owner = await ctx.db.insert("users", { email: "owner@cleaner-approval.test", passwordHash, name: "Owner", companyId: company, role: "owner", status: "active" });
      const cleaner = await ctx.db.insert("users", { email: "cleaner@cleaner-approval.test", passwordHash, name: "Cleaner", companyId: company, role: "cleaner", status: "active" });
      const job = await ctx.db.insert("jobs", { companyId: company, cleanerIds: [cleaner], type: "standard", status: "confirmed", scheduledDate: "2026-08-12", durationMinutes: 60, reworkCount: 0 });
      return { owner, cleaner, job };
    });
    const cleanerAuth = await login(t, "cleaner@cleaner-approval.test");
    const ownerAuth = await login(t, "owner@cleaner-approval.test");
    await t.run(async (ctx) => { await ctx.db.patch(seeded.owner, { email: "" }); await ctx.db.patch(seeded.cleaner, { email: "" }); });
    await t.mutation(api.mutations.jobs.startJob, { jobId: seeded.job, userId: seeded.cleaner, sessionToken: cleanerAuth.sessionToken });
    const form = await t.run((ctx) => ctx.db.query("forms").withIndex("by_jobId", (q) => q.eq("jobId", seeded.job)).unique());
    await t.mutation(api.mutations.forms.markAllComplete, { formId: form!._id, userId: seeded.cleaner, sessionToken: cleanerAuth.sessionToken });
    await t.mutation(api.mutations.forms.submit, { formId: form!._id, userId: seeded.cleaner, sessionToken: cleanerAuth.sessionToken });
    await t.mutation(api.mutations.jobs.completeJob, { jobId: seeded.job, userId: seeded.cleaner, sessionToken: cleanerAuth.sessionToken });
    await t.mutation(api.mutations.forms.approve, { formId: form!._id, userId: seeded.owner, sessionToken: ownerAuth.sessionToken });
    await expect(t.run((ctx) => ctx.db.get(seeded.job))).resolves.toMatchObject({ status: "approved", approvedAt: expect.any(Number) });
  });
});
