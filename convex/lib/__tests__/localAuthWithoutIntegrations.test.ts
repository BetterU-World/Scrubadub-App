import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";

const modules = import.meta.glob("../../**/*.ts");
const ORIGINAL_ENV = { ...process.env };

describe("local auth and core CRUD without integrations", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "local-auth-test-pepper";
    process.env.APP_URL = "http://localhost:5173";
    process.env.SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS = "true";
    for (const key of [
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_ACCOUNT_SECRET",
      "STRIPE_WEBHOOK_CONNECT_SECRET",
      "RESEND_API_KEY",
      "RESEND_FROM_EMAIL",
      "BLOB_READ_WRITE_TOKEN",
    ]) delete process.env[key];
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in ORIGINAL_ENV)) delete process.env[key];
    }
    Object.assign(process.env, ORIGINAL_ENV);
  });

  it("signs up, signs in, and creates authenticated company data", async () => {
    const t = convexTest(schema, modules);
    const signup = await t.action(api.authActions.signUp, {
      email: "owner@local-qa.test",
      password: "safe-local-password-123",
      name: "QA Owner",
      companyName: "QA Cleaning Co",
    });

    const login = await t.action(api.authActions.signIn, {
      email: "owner@local-qa.test",
      password: "safe-local-password-123",
    });
    expect(login.userId).toBe(signup.userId);

    const propertyId = await t.mutation(api.mutations.properties.create, {
      userId: login.userId,
      sessionToken: login.sessionToken,
      companyId: signup.companyId,
      name: "QA Property",
      type: "residential",
      address: "1 Example Way",
      amenities: [],
    });
    await expect(t.run((ctx) => ctx.db.get(propertyId))).resolves.toMatchObject({
      companyId: signup.companyId,
      name: "QA Property",
    });
  });

  it("creates an invitation without scheduling shared-production email", async () => {
    const t = convexTest(schema, modules);
    const owner = await t.action(api.authActions.signUp, {
      email: "owner-invite@local-qa.test",
      password: "safe-local-password-123",
      name: "QA Owner",
      companyName: "QA Invite Co",
    });
    const invitation = await t.action(api.employeeActions.inviteCleaner, {
      companyId: owner.companyId,
      email: "worker@local-qa.test",
      name: "QA Worker",
      userId: owner.userId,
      sessionToken: owner.sessionToken,
      role: "cleaner",
    });
    expect(invitation.emailSent).toBe(false);
    expect(invitation.token).toBeTruthy();
  });
});
