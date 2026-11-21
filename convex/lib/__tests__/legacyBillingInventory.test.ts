import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../schema";
import { readFileSync } from "node:fs";

const modules = import.meta.glob("../../**/*.ts");
const inventory = makeFunctionReference<"query">("legacyBillingInventory:page");
const asOf = 1_800_000_000_000;
const day = 24 * 60 * 60 * 1000;
const args = { asOf, confirmation: "READ ONLY LEGACY BILLING INVENTORY", paginationOpts: { cursor: null, numItems: 50 } };
type Result = { page: Array<{companyId: string; subscriptionStatus: string | null; complimentaryEntitlement: string; operationalAccessChange: {ownerWorkspaceRestricted: boolean; backendWritesRestricted: boolean}}> ; continueCursor: string; isDone: boolean };

describe("minimal read-only legacy billing inventory", () => {
  beforeEach(() => vi.stubEnv("FOUNDER_EMAILS", "  Approved@inventory.test , other@inventory.test "));
  afterEach(() => vi.unstubAllEnvs());

  async function setup(status: string | undefined, extra = {}) {
    const t = convexTest(schema, modules);
    const companyId = await t.run(async ctx => {
      const id = await ctx.db.insert("companies", {name: "Private customer", timezone: "UTC", subscriptionStatus: status, ...extra});
      await ctx.db.insert("users", {companyId: id, email: "APPROVED@inventory.test", role: "owner", status: "inactive", name: "Private owner", passwordHash: "private-hash"});
      return id;
    });
    return {t, companyId};
  }

  it("includes inactive owners, all duplicate-email companies and deduplicates same-page companies", async () => {
    const {t, companyId} = await setup("canceled");
    const otherId = await t.run(async ctx => {
      const base = {email: "approved@inventory.test", role: "owner" as const, status: "pending" as const, name: "Private", passwordHash: "private"};
      await ctx.db.insert("users", {...base, companyId});
      const id = await ctx.db.insert("companies", {name: "Other", timezone: "UTC"});
      await ctx.db.insert("users", {...base, companyId: id});
      await ctx.db.insert("users", {...base, companyId: id, role: "manager", email: "other@inventory.test"});
      return id;
    });
    const result = await t.query(inventory, args) as Result;
    expect(result.page.map(row => row.companyId).sort()).toEqual([companyId, otherId].sort());
    expect(Object.keys(result.page[0]).sort()).toEqual(["companyId", "complimentaryEntitlement", "operationalAccessChange", "subscriptionStatus"]);
    expect(JSON.stringify(result)).not.toMatch(/inventory\.test|Private|private-hash/);
    expect(result.page.find(row => row.companyId === companyId)?.operationalAccessChange).toEqual({ownerWorkspaceRestricted: true, backendWritesRestricted: true});
  });

  it.each([
    ["active", {}, false, false], ["trialing", {}, false, false],
    [undefined, {}, true, false], ["canceled", {}, true, true],
    ["past_due", {currentPeriodEnd: (asOf - day) / 1000}, true, false],
    ["past_due", {currentPeriodEnd: asOf - 3 * day}, true, true],
    ["canceled", {subscriptionBecameInactiveAt: asOf - day}, false, true],
    ["canceled", {subscriptionBecameInactiveAt: asOf - 3 * day}, true, true],
  ])("reports independent access gates for %s with %j", async (status, extra, workspace, writes) => {
    const {t} = await setup(status, extra);
    const result = await t.query(inventory, args) as Result;
    expect(result.page[0].operationalAccessChange).toEqual({ownerWorkspaceRestricted: workspace, backendWritesRestricted: writes});
  });

  it.each([true, false])("reports active=%s explicit entitlements without changing data", async active => {
    const {t, companyId} = await setup("canceled");
    await t.run(ctx => ctx.db.insert("complimentarySubscriptions", {companyId, active, revision: 1, updatedAt: asOf}));
    const before = await t.run(async ctx => ({company: await ctx.db.get(companyId), grants: await ctx.db.query("complimentarySubscriptions").collect(), audit: await ctx.db.query("platformProvisioningAudit").collect()}));
    const result = await t.query(inventory, args) as Result;
    expect(result.page[0].complimentaryEntitlement).toBe(active ? "active" : "inactive");
    expect(result.page[0].operationalAccessChange).toEqual({ownerWorkspaceRestricted: !active, backendWritesRestricted: !active});
    expect(await t.run(async ctx => ({company: await ctx.db.get(companyId), grants: await ctx.db.query("complimentarySubscriptions").collect(), audit: await ctx.db.query("platformProvisioningAudit").collect()}))).toEqual(before);
  });

  it("continues through empty pages and excludes nonowners, unlinked owners and whitespace mismatches", async () => {
    const {t, companyId} = await setup("canceled");
    await t.run(async ctx => {
      await ctx.db.insert("users", {email: "approved@inventory.test", role: "manager", status: "active", name: "Private", passwordHash: "private"});
      await ctx.db.insert("users", {email: "approved@inventory.test", role: "owner", status: "active", name: "Private", passwordHash: "private"});
      const id = await ctx.db.insert("companies", {name: "Excluded", timezone: "UTC", subscriptionStatus: "active"});
      await ctx.db.insert("users", {companyId: id, email: " approved@inventory.test ", role: "owner", status: "active", name: "Private", passwordHash: "private"});
      await ctx.db.insert("users", {companyId: id, email: "approved@inventory.test", role: "manager", status: "active", name: "Private", passwordHash: "private"});
      await ctx.db.insert("users", {companyId: id, email: "ordinary@inventory.test", role: "owner", status: "active", name: "Private", passwordHash: "private"});
    });
    let cursor: string | null = null;
    const found = new Set<string>(); let done = false; let emptyPages = 0;
    while (!done) {
      const result = await t.query(inventory, {...args, paginationOpts: {cursor, numItems: 1}}) as Result;
      result.page.forEach(row => found.add(row.companyId));
      if (!result.page.length) emptyPages++;
      cursor = result.continueCursor; done = result.isDone;
    }
    expect([...found]).toEqual([companyId]); expect(emptyPages).toBeGreaterThan(0);
  });

  it("rejects invalid bounds, timestamps and ambiguous entitlement data", async () => {
    const {t, companyId} = await setup("canceled");
    await expect(t.query(inventory, {...args, asOf: -1})).rejects.toThrow("timestamp");
    await expect(t.query(inventory, {...args, paginationOpts: {cursor: null, numItems: 51}})).rejects.toThrow("page size");
    await expect(t.query(inventory, {...args, confirmation: ""})).rejects.toThrow();
    await t.run(async ctx => {
      for (const active of [true, false]) await ctx.db.insert("complimentarySubscriptions", {companyId, active, revision: 1, updatedAt: asOf});
    });
    await expect(t.query(inventory, args)).rejects.toThrow();
  });

  it("has only an internal query and no mutation, action or external API capability", () => {
    const source = readFileSync(new URL("../../legacyBillingInventory.ts", import.meta.url), "utf8");
    expect(source).toContain("page = internalQuery(");
    expect(source).not.toMatch(/=\s*(?:mutation|action|query|internalMutation|internalAction)\s*\(|ctx\.db\.(?:insert|patch|replace|delete)|fetch\s*\(/);
  });
});
