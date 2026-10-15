import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { readFileSync } from "node:fs";
import schema from "../../schema";
import { hasPlatformAdmin, hasComplimentarySubscription } from "../platformEntitlements";

const modules = import.meta.glob("../../**/*.ts");
const grant = makeFunctionReference<"mutation">("platformProvisioning:setAdministrator");
const billing = makeFunctionReference<"mutation">("platformProvisioning:setComplimentarySubscription");
const readiness = makeFunctionReference<"query">("platformProvisioning:readiness");
const operator = { operator: "synthetic-operator", approvalReference: "TEST-APPROVAL", reason: "Isolated regression fixture" };

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const companyId = await ctx.db.insert("companies", { name: "Synthetic", timezone: "America/New_York", subscriptionStatus: "canceled" });
    const userId = await ctx.db.insert("users", { email: "admin@entitlement.test", name: "Synthetic", passwordHash: "not-a-real-password", role: "affiliate", status: "active" });
    return { companyId, userId };
  });
  return { t, ...ids };
}

describe("operator-only platform entitlement provisioning", () => {
  beforeEach(() => { process.env.TOKEN_PEPPER = "test-token-pepper"; });

  it("grants and revokes by ID, records immutable attribution and rejects stale requests", async () => {
    const s = await setup();
    const args = { ...operator, userId: s.userId, active: true, expectedRevision: 0, confirmation: `GRANT ADMIN ${s.userId}` };
    await expect(s.t.mutation(grant, args)).resolves.toMatchObject({ active: true, revision: 1 });
    expect(await s.t.run(ctx => hasPlatformAdmin(ctx, s.userId))).toBe(true);
    await expect(s.t.mutation(grant, args)).rejects.toThrow("changed");
    await s.t.mutation(grant, { ...args, active: false, expectedRevision: 1, confirmation: `REVOKE ADMIN ${s.userId}` });
    expect(await s.t.run(ctx => hasPlatformAdmin(ctx, s.userId))).toBe(false);
    const audit = await s.t.run(ctx => ctx.db.query("platformProvisioningAudit").collect());
    expect(audit).toHaveLength(2);
    expect(audit.map(row => ({ active: row.active, revision: row.revision, operator: row.operator, approvalReference: row.approvalReference }))).toEqual([
      { active: true, revision: 1, operator: operator.operator, approvalReference: operator.approvalReference },
      { active: false, revision: 2, operator: operator.operator, approvalReference: operator.approvalReference },
    ]);
  });

  it("keeps billing separate and readiness read-only and fail closed", async () => {
    const s = await setup();
    const check = { approvedAdministratorIds: [s.userId], approvedComplimentaryCompanyIds: [s.companyId], confirmation: "VERIFY APPROVED PLATFORM IDS", approvalReference: "TEST-APPROVAL" };
    expect((await s.t.query(readiness, check) as any).ready).toBe(false);
    await s.t.mutation(grant, { ...operator, userId: s.userId, active: true, expectedRevision: 0, confirmation: `GRANT ADMIN ${s.userId}` });
    expect(await s.t.run(ctx => hasComplimentarySubscription(ctx, s.companyId))).toBe(false);
    expect((await s.t.query(readiness, check) as any).ready).toBe(false);
    await s.t.mutation(billing, { ...operator, companyId: s.companyId, active: true, expectedRevision: 0, confirmation: `GRANT BILLING ${s.companyId}` });
    const before = await s.t.run(ctx => ctx.db.query("platformProvisioningAudit").collect());
    expect((await s.t.query(readiness, check) as any).ready).toBe(true);
    expect(await s.t.run(ctx => ctx.db.query("platformProvisioningAudit").collect())).toEqual(before);
    await s.t.run(ctx => ctx.db.patch(s.userId, { status: "inactive" }));
    expect((await s.t.query(readiness, check) as any).ready).toBe(false);
    expect(await s.t.run(ctx => hasComplimentarySubscription(ctx, s.companyId))).toBe(true);
    await expect(s.t.query(readiness, { ...check, approvedAdministratorIds: [] })).rejects.toThrow("approved administrators");
    await expect(s.t.query(readiness, { ...check, confirmation: "" })).rejects.toThrow("confirmation");
  });

  it("requires exact operator intent, attribution and an active target without partial writes", async () => {
    const s = await setup();
    const args = { ...operator, userId: s.userId, active: true, expectedRevision: 0, confirmation: `GRANT ADMIN ${s.userId}` };
    await expect(s.t.mutation(grant, { ...args, confirmation: "GRANT" })).rejects.toThrow("confirmation");
    await expect(s.t.mutation(grant, { ...args, approvalReference: "" })).rejects.toThrow("attribution");
    await s.t.run(ctx => ctx.db.patch(s.userId, { status: "pending" }));
    await expect(s.t.mutation(grant, args)).rejects.toThrow("active staff");
    expect(await s.t.run(ctx => ctx.db.query("platformAdmins").collect())).toEqual([]);
    expect(await s.t.run(ctx => ctx.db.query("platformProvisioningAudit").collect())).toEqual([]);
  });

  it("does not transfer grants through an email change or account recreation", async () => {
    const s = await setup();
    await s.t.mutation(grant, { ...operator, userId: s.userId, active: true, expectedRevision: 0, confirmation: `GRANT ADMIN ${s.userId}` });
    const otherId = await s.t.run(async ctx => {
      await ctx.db.patch(s.userId, { email: "changed@entitlement.test" });
      return ctx.db.insert("users", { email: "admin@entitlement.test", name: "Other", passwordHash: "unused", role: "owner", status: "active" });
    });
    expect(await s.t.run(ctx => hasPlatformAdmin(ctx, otherId))).toBe(false);
    expect(await s.t.run(ctx => hasPlatformAdmin(ctx, s.userId))).toBe(true);
    await s.t.run(ctx => ctx.db.delete(s.userId));
    expect(await s.t.run(ctx => hasPlatformAdmin(ctx, s.userId))).toBe(false);
  });

  it("exposes no public provisioning endpoint or user entitlement arguments", () => {
    const source = readFileSync(new URL("../../platformProvisioning.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/export const \w+ = (?:mutation|query|action|httpAction)\(/);
    const auth = readFileSync(new URL("../../authActions.ts", import.meta.url), "utf8");
    const invites = readFileSync(new URL("../../employeeActions.ts", import.meta.url), "utf8");
    expect(auth + invites).not.toMatch(/platformAdmins|setAdministrator|platformProvisioning/);
  });
});
