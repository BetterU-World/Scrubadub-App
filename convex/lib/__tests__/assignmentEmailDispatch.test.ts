import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { internal } from "../../_generated/api";
import { sendJobAssignedEmail, deliverJobAssignedEmail } from "../email";
vi.mock("../email", async importOriginal => ({ ...await importOriginal<typeof import("../email")>(), sendJobAssignedEmail: vi.fn().mockResolvedValue(true), deliverJobAssignedEmail: vi.fn().mockResolvedValue({ status: "provider_accepted" }) }));
const modules = import.meta.glob("../../**/*.ts");
afterEach(() => vi.clearAllMocks());

describe("assignment email dispatch", () => {
  it("suppresses superseded invitations and sends fresh details instead of the queued snapshot", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async ctx => {
      const companyId = await ctx.db.insert("companies", { name: "Current Company", timezone: "UTC", contactEmail: "reply@current.test" });
      const worker = await ctx.db.insert("users", { companyId, name: "Worker", email: "current@worker.test", role: "cleaner", status: "active", passwordHash: "unused" });
      const job = await ctx.db.insert("jobs", { companyId, cleanerIds: [worker], type: "standard", status: "scheduled", scheduledDate: "2030-02-01", durationMinutes: 60, reworkCount: 0, assignmentRevision: 2 });
      return { job, worker };
    });
    const args = { email: "old@worker.test", propertyName: "Old location", scheduledDate: "2030-01-01", companyName: "Old company", assignmentContext: { jobId: ids.job, workerId: ids.worker, revision: 1 } };
    await t.action(internal.actions.emailNotifications.sendJobAssigned, args);
    expect(deliverJobAssignedEmail).not.toHaveBeenCalled();
    await t.action(internal.actions.emailNotifications.sendJobAssigned, { ...args, assignmentContext: { ...args.assignmentContext, revision: 2 } });
    expect(deliverJobAssignedEmail).toHaveBeenCalledExactlyOnceWith("current@worker.test", "a property", "2030-02-01", undefined, { companyName: "Current Company", replyTo: "reply@current.test" });
    await t.run(ctx => ctx.db.patch(ids.job, { cleanerIds: [] }));
    await t.action(internal.actions.emailNotifications.sendJobAssigned, { ...args, assignmentContext: { ...args.assignmentContext, revision: 2 } });
    expect(deliverJobAssignedEmail).toHaveBeenCalledTimes(1);
  });
  it("retains the validator contract of already-queued legacy payloads", async () => {
    const t = convexTest(schema, modules);
    await t.action(internal.actions.emailNotifications.sendJobAssigned, { email: "legacy@worker.test", propertyName: "Place", scheduledDate: "2030-01-01", companyName: "Legacy" });
    expect(sendJobAssignedEmail).toHaveBeenCalledExactlyOnceWith("legacy@worker.test", "Place", "2030-01-01", undefined, { companyName: "Legacy", replyTo: undefined });
  });
});
