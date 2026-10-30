import { beforeAll, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";

const modules = import.meta.glob("../../**/*.ts");
let passwordHash: string;
beforeAll(async () => { passwordHash = await hashPassword("test-password-123"); });

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const companyId = await ctx.db.insert("companies", { name: "Fast", timezone: "UTC" });
    const foreignCompany = await ctx.db.insert("companies", { name: "Other", timezone: "UTC" });
    async function user(name: string, role: "owner" | "manager" | "cleaner" | "maintenance", company = companyId, delegated = false) {
      return ctx.db.insert("users", { companyId: company, email: `${name}@fast.test`, name, role,
        status: "active", passwordHash, canManageTeam: delegated });
    }
    const owner = await user("owner", "owner");
    const manager = await user("manager", "manager", companyId, true);
    const limited = await user("limited", "manager");
    const cleaner = await user("cleaner", "cleaner");
    const member = await user("member", "cleaner");
    const outsider = await user("outsider", "cleaner");
    const foreign = await user("foreign", "cleaner", foreignCompany);
    const maintenance = await user("maintenance", "maintenance");
    const jobId = await ctx.db.insert("jobs", { companyId, cleanerIds: [cleaner, member], type: "standard",
      status: "in_progress", scheduledDate: "2026-10-30", durationMinutes: 60, reworkCount: 0 });
    const formId = await ctx.db.insert("forms", { jobId, companyId, cleanerId: cleaner, status: "in_progress" });
    const itemIds = [];
    for (const [section, itemName] of [["Kitchen", "Sink"], ["Kitchen", "Oven"], ["Bathroom", "Shower"]]) {
      itemIds.push(await ctx.db.insert("formItems", { formId, section, itemName, order: itemIds.length, completed: false, isRedFlag: false }));
    }
    return { companyId, foreignCompany, owner, manager, limited, cleaner, member, outsider, foreign, maintenance, jobId, formId, itemIds };
  });
  const login = async (name: string) => {
    const session = await t.action(api.authActions.signIn, { email: `${name}@fast.test`, password: "test-password-123" });
    return { userId: session.userId, sessionToken: session.sessionToken };
  };
  const ownerArgs = await login("owner");
  const cleanerArgs = await login("cleaner");
  const grant = (eligible = true, workerUserId = ids.cleaner, actor = ownerArgs) =>
    t.mutation(api.mutations.workers.setFastModeEligibility, { ...actor, workerUserId, eligible });
  const confirm = (section = "Kitchen", actor = cleanerArgs) =>
    t.mutation(api.mutations.forms.confirmSection, { ...actor, formId: ids.formId, section });
  const items = () => t.run(ctx => ctx.db.query("formItems").withIndex("by_formId", q => q.eq("formId", ids.formId)).collect());
  const audits = (action: string) => t.run(async ctx => (await ctx.db.query("auditLog").collect()).filter(row => row.action === action));
  return { t, ...ids, login, ownerArgs, cleanerArgs, grant, confirm, items, audits };
}

describe("trusted-cleaner section confirmation", () => {
  it("defaults missing and legacy profiles to ineligible without fabricating provenance", async () => {
    const s = await setup();
    expect(await s.t.query(api.queries.forms.fastModeEligibility, s.cleanerArgs)).toBe(false);
    await s.t.run(ctx => ctx.db.insert("workerProfiles", { companyId: s.companyId, userId: s.cleaner,
      workerType: "contractor_1099", workerStatus: "active", primaryRole: "cleaner", eligibleRoles: ["cleaner"],
      onboardingStatus: "complete", jobEligibilityStatus: "eligible", createdAt: 1, updatedAt: 1 }));
    expect(await s.t.query(api.queries.forms.fastModeEligibility, s.cleanerArgs)).toBe(false);
    expect((await s.items()).every(item => item.completionConfirmation === undefined)).toBe(true);
    await expect(s.confirm()).rejects.toThrow("Fast Mode eligibility required");
  });

  it("allows Owner grants/revocations and records the administering actor", async () => {
    const s = await setup(); await s.grant();
    expect(await s.t.query(api.queries.forms.fastModeEligibility, s.cleanerArgs)).toBe(true);
    await s.grant(false);
    expect(await s.t.query(api.queries.forms.fastModeEligibility, s.cleanerArgs)).toBe(false);
    const events = await s.audits("set_fast_mode_eligibility");
    expect(events).toHaveLength(2);
    expect(events[0].userId).toBe(s.owner);
    expect(events[0].timestamp).toBeGreaterThan(0);
    expect(JSON.parse(events[1].details!)).toMatchObject({ workerUserId: s.cleaner, eligible: false });
  });

  it("allows only explicitly delegated Managers and exposes only the eligibility value in their directory", async () => {
    const s = await setup(); const actor = await s.login("manager");
    await s.grant(true, s.cleaner, actor);
    const directory = await s.t.query(api.queries.employees.list, { ...actor, companyId: s.companyId });
    const target = directory.find(row => row._id === s.cleaner);
    expect(target).toMatchObject({ fastModeEligible: true });
    expect(target).not.toHaveProperty("payProfile");
    await s.grant(false, s.cleaner, actor);
    await s.t.run(ctx => ctx.db.patch(s.manager, { canManageTeam: false }));
    await expect(s.grant(true, s.cleaner, actor)).rejects.toThrow("canManageTeam");
    await expect(s.grant(true, s.cleaner, await s.login("limited"))).rejects.toThrow("canManageTeam");
  });

  it("denies self-grants, supplied-identity escalation, foreign targets, and non-cleaning roles", async () => {
    const s = await setup();
    await expect(s.grant(true, s.cleaner, s.cleanerArgs)).rejects.toThrow();
    await expect(s.grant(true, s.cleaner, { ...s.cleanerArgs, userId: s.owner })).rejects.toThrow();
    for (const target of [s.foreign, s.maintenance, s.manager, s.owner]) {
      await expect(s.grant(true, target)).rejects.toThrow("Active company cleaner");
    }
  });

  it("denies inactive users/profiles and cross-company profile corruption", async () => {
    const s = await setup(); await s.grant();
    const profile = await s.t.run(ctx => ctx.db.query("workerProfiles").withIndex("by_userId", q => q.eq("userId", s.cleaner)).first());
    await s.t.run(ctx => ctx.db.patch(profile!._id, { workerStatus: "inactive" }));
    await expect(s.grant()).rejects.toThrow("Active company cleaner");
    await expect(s.confirm()).rejects.toThrow();
    await s.t.run(ctx => ctx.db.patch(profile!._id, { workerStatus: "active", companyId: s.foreignCompany }));
    await expect(s.confirm()).rejects.toThrow();
    await s.t.run(ctx => ctx.db.patch(s.cleaner, { status: "inactive" }));
    await expect(s.grant()).rejects.toThrow("Active company cleaner");
  });

  it("confirms only the requested section, with actor/method/time/scope and idempotent retries", async () => {
    const s = await setup(); await s.grant();
    expect(await s.confirm()).toEqual({ completedCount: 2 });
    const rows = await s.items();
    for (const item of rows.filter(row => row.section === "Kitchen")) {
      expect(item.completed).toBe(true);
      expect(item.completionConfirmation).toMatchObject({ method: "section", confirmedById: s.cleaner });
      expect(item.completionConfirmation!.confirmedAt).toBeGreaterThan(0);
    }
    expect(rows.find(row => row.section === "Bathroom")!.completed).toBe(false);
    expect(await s.confirm()).toEqual({ completedCount: 0 });
    const events = await s.audits("confirm_checklist_section");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ companyId: s.companyId, userId: s.cleaner, entityType: "form", entityId: s.formId });
    expect(events[0].timestamp).toBeGreaterThanOrEqual(JSON.parse(events[0].details!).confirmedAt);
    expect(JSON.parse(events[0].details!)).toMatchObject({ method: "section", formId: s.formId, jobId: s.jobId, section: "Kitchen", completedCount: 2 });
    await expect(s.confirm("Fake section")).rejects.toThrow("section not found");
  });

  it("blocks unassigned and foreign callers even with a claimed cleaner identity", async () => {
    const s = await setup(); await s.grant();
    await s.grant(true, s.outsider);
    await expect(s.confirm("Kitchen", await s.login("outsider"))).rejects.toThrow("Not assigned");
    await expect(s.confirm("Kitchen", await s.login("foreign"))).rejects.toThrow("Access denied");
  });

  it("isolates eligibility among workers sharing a job", async () => {
    const s = await setup(); await s.grant();
    const memberArgs = await s.login("member");
    await expect(s.confirm("Kitchen", memberArgs)).rejects.toThrow("Fast Mode eligibility required");
    await s.confirm();
    await s.t.mutation(api.mutations.forms.updateItem, { ...memberArgs, itemId: s.itemIds[2], completed: true });
    expect((await s.items()).find(row => row._id === s.itemIds[2])!.completionConfirmation).toMatchObject({ method: "individual", confirmedById: s.member });
  });

  it("revokes the next action in an existing session while preserving previous work and history", async () => {
    const s = await setup(); await s.grant(); await s.confirm(); await s.grant(false);
    await expect(s.confirm("Bathroom")).rejects.toThrow("Fast Mode eligibility required");
    expect((await s.items()).filter(row => row.completed)).toHaveLength(2);
    expect(await s.audits("confirm_checklist_section")).toHaveLength(1);
    await s.t.mutation(api.mutations.forms.updateItem, { ...s.cleanerArgs, itemId: s.itemIds[2], completed: true });
    expect((await s.items()).every(row => row.completed)).toBe(true);
  });

  it("keeps legacy whole-form calls harmless for eligible and ineligible clients", async () => {
    const s = await setup();
    const legacy = () => s.t.mutation(api.mutations.forms.markAllComplete, { ...s.cleanerArgs, formId: s.formId });
    await expect(legacy()).resolves.toBeNull(); await s.grant(); await legacy(); await legacy();
    expect((await s.items()).every(row => !row.completed)).toBe(true);
    expect(await s.audits("confirm_checklist_section")).toHaveLength(0);
    await s.confirm();
    const previous = await s.items();
    await legacy();
    expect(await s.items()).toEqual(previous);
    await expect(s.t.mutation(api.mutations.forms.markAllComplete, {
      ...await s.login("outsider"), formId: s.formId,
    })).rejects.toThrow("Not assigned");
  });

  it.each(["manager", "owner", "maintenance"] as const)("does not infer Fast Mode eligibility from cleaner profile labels after a role change to %s", async role => {
    const s = await setup(); await s.grant();
    await s.t.run(ctx => ctx.db.patch(s.cleaner, { role }));
    expect(await s.t.query(api.queries.forms.fastModeEligibility, s.cleanerArgs)).toBe(false);
    await expect(s.confirm()).rejects.toThrow();
    expect((await s.items()).every(item => !item.completed)).toBe(true);
  });

  it("retains section history when an item is reopened and completed individually", async () => {
    const s = await setup(); await s.grant(); await s.confirm();
    await s.t.mutation(api.mutations.forms.updateItem, { ...s.cleanerArgs, itemId: s.itemIds[0], completed: false });
    expect((await s.items()).find(row => row._id === s.itemIds[0])!.completionConfirmation).toBeUndefined();
    await s.t.mutation(api.mutations.forms.updateItem, { ...s.cleanerArgs, itemId: s.itemIds[0], completed: true });
    expect((await s.items()).find(row => row._id === s.itemIds[0])!.completionConfirmation?.method).toBe("individual");
    expect(await s.audits("confirm_checklist_section")).toHaveLength(1);
  });

  it.each(["submitted", "approved", "rework_requested"] as const)("blocks section writes in %s state", async status => {
    const s = await setup(); await s.grant();
    await s.t.run(async ctx => { await ctx.db.patch(s.formId, { status }); await ctx.db.patch(s.jobId, { status }); });
    await expect(s.confirm()).rejects.toThrow();
    const legacy = s.t.mutation(api.mutations.forms.markAllComplete, { ...s.cleanerArgs, formId: s.formId });
    if (status === "rework_requested") await expect(legacy).resolves.toBeNull();
    else await expect(legacy).rejects.toThrow();
    expect((await s.items()).every(row => !row.completed)).toBe(true);
  });

  it("rejects a non-progress job, closed timer, and invalid session", async () => {
    const s = await setup(); await s.grant();
    await s.t.run(ctx => ctx.db.patch(s.jobId, { status: "confirmed" }));
    await expect(s.confirm()).rejects.toThrow("not in progress");
    await s.t.run(ctx => ctx.db.patch(s.jobId, { status: "in_progress", timerStoppedAt: Date.now() }));
    await expect(s.confirm()).rejects.toThrow("unavailable");
    await expect(s.confirm("Kitchen", { ...s.cleanerArgs, sessionToken: "invalid" })).rejects.toThrow();
  });
});
