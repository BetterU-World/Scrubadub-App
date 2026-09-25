import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";

const modules = import.meta.glob("../../**/*.ts");
const password = "test-password-123";

async function setup() {
  process.env.TOKEN_PEPPER = "sign-in-error-contract-test";
  const t = convexTest(schema, modules);
  const passwordHash = await hashPassword(password);
  await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Login Test", timezone: "America/New_York" });
    await ctx.db.insert("users", { companyId, email: "staff@example.test", passwordHash, name: "Staff", role: "owner", status: "active" });
    await ctx.db.insert("clientUsers", { email: "client@example.test", passwordHash, displayName: "Client", status: "active", createdAt: 1, updatedAt: 1 });
  });
  return t;
}

describe("neutral sign-in error contract", () => {
  for (const [kind, action, email] of [
    ["staff", api.authActions.signIn, "staff@example.test"],
    ["client", api.clientAuthActions.signIn, "client@example.test"],
  ] as const) {
    it(`${kind} wrong password and nonexistent account share the same data code`, async () => {
      const t = await setup();
      const failures = await Promise.allSettled([
        t.action(action as any, { email, password: "wrong-password" }),
        t.action(action as any, { email: `missing-${email}`, password }),
      ]);
      for (const failure of failures) {
        expect(failure.status).toBe("rejected");
        if (failure.status === "rejected") {
          expect(JSON.parse(failure.reason.data)).toEqual({ code: "INVALID_CREDENTIALS", message: "Invalid email or password" });
        }
      }
    });

    it(`${kind} rate limiting remains distinguishable from credential failure`, async () => {
      const t = await setup();
      for (let attempt = 0; attempt < 5; attempt++) {
        await expect(t.action(action as any, { email: `missing-${email}`, password })).rejects.toThrow();
      }
      try {
        await t.action(action as any, { email: `missing-${email}`, password });
        throw new Error("Expected rate limit");
      } catch (error: any) {
        expect(JSON.parse(JSON.parse(error.data))).toBe("Rate limit exceeded. Please wait a moment before trying again.");
      }
    });
  }
});
