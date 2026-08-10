import { beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";
import { runPropertySave } from "../../../packages/frontend/src/lib/propertySaveFeedback";

const modules = import.meta.glob("../../**/*.ts");
const PASSWORD = "test-password-123";

function makeTest() {
  return convexTest(schema, modules);
}

async function seed(t: ReturnType<typeof convexTest>) {
  const passwordHash = await hashPassword(PASSWORD);
  return await t.run(async (ctx) => {
    const companyA = await ctx.db.insert("companies", { name: "A", timezone: "America/New_York" });
    const companyB = await ctx.db.insert("companies", { name: "B", timezone: "America/New_York" });
    const ownerA = await ctx.db.insert("users", { email: "owner-a@property.test", passwordHash, name: "Owner A", companyId: companyA, role: "owner", status: "active" });
    const ownerB = await ctx.db.insert("users", { email: "owner-b@property.test", passwordHash, name: "Owner B", companyId: companyB, role: "owner", status: "active" });
    const managerA = await ctx.db.insert("users", { email: "manager-a@property.test", passwordHash, name: "Manager A", companyId: companyA, role: "manager", status: "active" });
    const workerA = await ctx.db.insert("users", { email: "worker-a@property.test", passwordHash, name: "Worker A", companyId: companyA, role: "cleaner", status: "active" });
    const relationshipA = await ctx.db.insert("clientRelationships", {
      companyId: companyA,
      displayName: "Client A",
      clientType: "residential",
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const propertyA = await ctx.db.insert("properties", { companyId: companyA, name: "A Property", type: "residential", address: "1 Main", amenities: [], active: true });
    const propertyB = await ctx.db.insert("properties", { companyId: companyB, name: "B Property", type: "residential", address: "2 Main", amenities: [], active: true });
    return { ownerA, ownerB, managerA, workerA, relationshipA, propertyA, propertyB };
  });
}

async function login(t: ReturnType<typeof convexTest>, email: string) {
  return await t.action(api.authActions.signIn, { email, password: PASSWORD });
}

function updateArgs(seedData: Awaited<ReturnType<typeof seed>>, userId: any, sessionToken: string, propertyId = seedData.propertyA) {
  return {
    propertyId,
    userId,
    sessionToken,
    clientRelationshipId: seedData.relationshipA,
    name: "Updated Property",
    type: "vacation_rental" as const,
    address: "100 Updated Ave",
    accessInstructions: "Gate code 1234",
    amenities: ["Pool", "Wi-Fi"],
    towelCount: 12,
    sheetSets: 8,
    pillowCount: 6,
    linenTypes: ["Cotton"],
    supplies: ["Soap"],
    beds: 1,
    bedrooms: [{
      id: "bedroom-1",
      label: "Primary",
      beds: [{ id: "bed-1", type: "standard_bed" as const, size: "queen" as const, quantity: 1, sheetSets: 3, sleepingPillows: 4 }],
    }],
    baths: 2,
    linenCount: 20,
    hasStandaloneTub: true,
    showerGlassDoorCount: 1,
    maintenanceNotes: "Check filter",
    ownerNotes: "Preferred arrival 9 AM",
    squareFootage: 1800,
    trashCanCount: 4,
    restroomCount: 2,
  };
}

describe("property update regression", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "test-token-pepper";
    process.env.STRIPE_SECRET_KEY = "test-stripe-key";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "test-webhook-secret";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.APP_URL = "http://localhost:5173";
  });

  it("accepts the former production payload for a verified owner", async () => {
    const t = makeTest();
    const s = await seed(t);
    const auth = await login(t, "owner-a@property.test");
    await expect(t.mutation(api.mutations.properties.update, updateArgs(s, s.ownerA, auth.sessionToken))).resolves.toBeNull();
    const property = await t.run((ctx) => ctx.db.get(s.propertyA));
    expect(property).toMatchObject({
      name: "Updated Property",
      address: "100 Updated Ave",
      beds: 1,
      sheetSets: 3,
      pillowCount: 4,
    });
    expect(property).not.toHaveProperty("sessionToken");
  });

  it("does not treat Manager role alone as property administration authority", async () => {
    const t = makeTest();
    const s = await seed(t);
    const auth = await login(t, "manager-a@property.test");
    await expect(t.mutation(api.mutations.properties.update, updateArgs(s, s.managerA, auth.sessionToken))).rejects.toThrow("Owner session required");
  });

  it("preserves verified-session identity and same-company authorization", async () => {
    const t = makeTest();
    const s = await seed(t);
    const ownerAuth = await login(t, "owner-a@property.test");
    const workerAuth = await login(t, "worker-a@property.test");

    await expect(t.mutation(api.mutations.properties.update, updateArgs(s, s.ownerA, ""))).rejects.toThrow("verified session is required");
    await expect(t.mutation(api.mutations.properties.update, updateArgs(s, s.ownerB, ownerAuth.sessionToken))).rejects.toThrow("does not match");
    await expect(t.mutation(api.mutations.properties.update, updateArgs(s, s.workerA, workerAuth.sessionToken))).rejects.toThrow("Owner session required");
    await expect(t.mutation(api.mutations.properties.update, updateArgs(s, s.ownerA, ownerAuth.sessionToken, s.propertyB))).rejects.toThrow("Not your company");
  });

  it("strips session transport data when creating a Property", async () => {
    const t = makeTest();
    const s = await seed(t);
    const auth = await login(t, "owner-a@property.test");
    const propertyId = await t.mutation(api.mutations.properties.create, {
      companyId: (await t.run((ctx) => ctx.db.get(s.propertyA)))!.companyId,
      userId: s.ownerA,
      sessionToken: auth.sessionToken,
      name: "Created Property",
      type: "residential",
      address: "3 Main",
      amenities: [],
    });
    const property = await t.run((ctx) => ctx.db.get(propertyId));
    expect(property).not.toHaveProperty("sessionToken");
  });

  it("documents the former schema failure when session transport data reaches persistence", async () => {
    const t = makeTest();
    const s = await seed(t);
    await expect(t.run((ctx) => ctx.db.patch(s.propertyA, {
      sessionToken: "test-session-token",
    } as any))).rejects.toThrow("Validator error: Unexpected field `sessionToken` in object");
  });
});

describe("property feedback ordering", () => {
  it("shows success only after the mutation resolves", async () => {
    let resolveMutation!: (value: string) => void;
    const mutation = new Promise<string>((resolve) => { resolveMutation = resolve; });
    const feedback = { success: vi.fn(), error: vi.fn() };
    const save = runPropertySave(() => mutation, feedback, "Saved", "Save failed");
    expect(feedback.success).not.toHaveBeenCalled();
    resolveMutation("property-id");
    await expect(save).resolves.toBe("property-id");
    expect(feedback.success).toHaveBeenCalledOnce();
    expect(feedback.error).not.toHaveBeenCalled();
  });

  it("shows safe error feedback and never success when the mutation rejects", async () => {
    const feedback = { success: vi.fn(), error: vi.fn() };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(runPropertySave(
      () => Promise.reject(new Error("[CONVEX M(mutations/properties:update)] Server Error Request ID: secret")),
      feedback,
      "Saved",
      "Unable to save property",
    )).rejects.toThrow("Server Error");
    expect(feedback.success).not.toHaveBeenCalled();
    expect(feedback.error).toHaveBeenCalledWith("Unable to save property");
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
