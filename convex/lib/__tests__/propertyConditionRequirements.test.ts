import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { jobRequiresPropertyConditionCheck, resolvePropertyConditionRequirement } from "../propertyConditionRequirements";

const modules = import.meta.glob("../../**/*.ts");

describe("property condition requirements", () => {
  it("defaults historical jobs to required and resolves company/location precedence", async () => {
    expect(jobRequiresPropertyConditionCheck({})).toBe(true);
    expect(jobRequiresPropertyConditionCheck({ requiresPropertyConditionCheck: false })).toBe(false);
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Mixed Work", timezone: "America/New_York" });
      await ctx.db.insert("companySettings", { companyId, requirePropertyConditionChecksByDefault: false, createdAt: 1, updatedAt: 1 });
      const inherited = await ctx.db.insert("properties", { companyId, name: "Office", type: "office", address: "1 Work", amenities: [], active: true, propertyConditionCheckOverride: "company_default" });
      const forced = await ctx.db.insert("properties", { companyId, name: "STR", type: "vacation_rental", address: "2 Stay", amenities: [], active: true, propertyConditionCheckOverride: "required" });
      await expect(resolvePropertyConditionRequirement(ctx, { companyId, propertyId: inherited })).resolves.toBe(false);
      await expect(resolvePropertyConditionRequirement(ctx, { companyId, propertyId: forced })).resolves.toBe(true);
      await ctx.db.patch(companyId, { name: "Mixed Work Updated" });
      expect(jobRequiresPropertyConditionCheck({ requiresPropertyConditionCheck: false })).toBe(false);
    });
  });
});
