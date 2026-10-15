import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { readFileSync } from "node:fs";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashToken } from "../tokens";
import type { AttachmentTarget } from "../attachmentUploads";
import type { Id } from "../../_generated/dataModel";

const modules = import.meta.glob("../../**/*.ts");
const inventory = makeFunctionReference<"query">("legacyAttachmentInventory:page");
beforeEach(() => { process.env.TOKEN_PEPPER = "test-token-pepper"; });

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const a = await ctx.db.insert("companies", { name: "Synthetic A", timezone: "UTC" });
    const b = await ctx.db.insert("companies", { name: "Synthetic B", timezone: "UTC" });
    const c = await ctx.db.insert("companies", { name: "Synthetic C", timezone: "UTC" });
    const staff: Record<string, Id<"users">> = {};
    for (const [name, companyId, role] of [["owner", a, "owner"], ["worker", a, "cleaner"], ["maintenance", a, "maintenance"], ["manager", a, "manager"], ["unassigned", a, "cleaner"], ["restricted", a, "manager"], ["foreign", b, "owner"], ["foreignWorker", b, "cleaner"], ["unrelated", c, "owner"]] as const) {
      const userId = await ctx.db.insert("users", { name, companyId, role, email: `${name}@attachment.test`, passwordHash: "unused", status: "active" });
      staff[name] = userId;
      await ctx.db.insert("authSessions", { userId, principalType: "staff", tokenHash: hashToken(name), version: 1, createdAt: Date.now(), lastUsedAt: Date.now(), expiresAt: Date.now() + 3600000, idleExpiresAt: Date.now() + 3600000 });
    }
    const property = await ctx.db.insert("properties", { companyId: a, name: "Synthetic", address: "Synthetic", type: "residential", amenities: [], active: true });
    const job = await ctx.db.insert("jobs", { companyId: a, propertyId: property, cleanerIds: [staff.worker, staff.manager], assignedManagerId: staff.manager, scheduledDate: "2026-10-15", type: "standard", status: "confirmed", durationMinutes: 60, reworkCount: 0 });
    const otherJob = await ctx.db.insert("jobs", { companyId: a, propertyId: property, cleanerIds: [staff.worker], scheduledDate: "2026-10-15", type: "standard", status: "confirmed", durationMinutes: 60, reworkCount: 0 });
    const foreignJob = await ctx.db.insert("jobs", { companyId: b, cleanerIds: [staff.foreignWorker], scheduledDate: "2026-10-15", type: "standard", status: "confirmed", durationMinutes: 60, reworkCount: 0 });
    const form = await ctx.db.insert("forms", { companyId: a, jobId: job, cleanerId: staff.worker, status: "in_progress" });
    const otherForm = await ctx.db.insert("forms", { companyId: a, jobId: otherJob, cleanerId: staff.worker, status: "in_progress" });
    const foreignForm = await ctx.db.insert("forms", { companyId: b, jobId: foreignJob, cleanerId: staff.foreignWorker, status: "in_progress" });
    const item = await ctx.db.insert("formItems", { formId: form, section: "Test", itemName: "Test", completed: false, isRedFlag: false, order: 0 });
    return { a, b, c, staff, property, job, otherJob, foreignJob, form, otherForm, foreignForm, item };
  });
  return { t, ...ids };
}
type S = Awaited<ReturnType<typeof setup>>;
async function upload(s: S, token: string, target: AttachmentTarget) {
  const intent = await s.t.mutation(api.attachmentUploads.begin, { sessionToken: token, target, mimeType: target.kind === "onboardingPdf" ? "application/pdf" : "image/jpeg" });
  const storageId = await s.t.run(async ctx => {
    const id = await ctx.storage.store(new Blob(["synthetic attachment"], { type: intent.contentType }));
    // convex-test does not retain parameters exactly like real upload metadata.
    await ctx.db.patch(id, { contentType: intent.contentType });
    return id;
  });
  return { storageId, uploadIntentId: intent.intentId };
}
const auth = (s: S, name: string) => ({ userId: s.staff[name], sessionToken: name });

describe("attachment provenance and authorized reads", () => {
  it("removes the arbitrary-ID URL endpoint entirely", async () => {
    const s = await setup();
    const storageId = await s.t.run(ctx => ctx.storage.store(new Blob(["synthetic"])));
    await expect(s.t.mutation(makeFunctionReference<"mutation">("mutations/storage:getUrl"), { ...auth(s, "owner"), storageId })).rejects.toThrow();
    expect(readFileSync(new URL("../../mutations/storage.ts", import.meta.url), "utf8")).not.toMatch(/export const getUrl/);
  });

  it("accepts authorized form, item, inspection, evidence and PDF uploads and resolves only authorized parents", async () => {
    const s = await setup();
    const photo = await upload(s, "worker", { kind: "formPhoto", formId: s.form });
    await s.t.mutation(api.mutations.forms.addPhoto, { ...auth(s, "worker"), formId: s.form, photoStorageId: photo.storageId, uploadIntentId: photo.uploadIntentId });
    expect((await s.t.query(api.queries.jobs.get, { ...auth(s, "owner"), jobId: s.job }))?.form?.photoUrls).toHaveLength(1);
    const item = await upload(s, "worker", { kind: "formItemPhoto", itemId: s.item });
    await s.t.mutation(api.mutations.forms.updateItem, { ...auth(s, "worker"), itemId: s.item, photoStorageId: item.storageId, uploadIntentId: item.uploadIntentId });
    expect((await s.t.query(api.queries.forms.getItems, { ...auth(s, "worker"), formId: s.form }))[0].photoUrl).toBeTruthy();
    const inspection = await upload(s, "manager", { kind: "inspectionPhoto", jobId: s.job });
    await s.t.mutation(api.mutations.inspections.submit, { ...auth(s, "manager"), jobId: s.job, readinessScore: 9, severity: "none", photoStorageIds: [inspection.storageId], photoUploadIntentIds: [inspection.uploadIntentId] });
    expect((await s.t.query(api.queries.inspections.getByJob, { ...auth(s, "owner"), jobId: s.job }))[0].photoUrls).toHaveLength(1);
    const evidence = await upload(s, "worker", { kind: "redFlagPhoto", jobId: s.job });
    await s.t.mutation(api.mutations.redFlags.create, { ...auth(s, "worker"), companyId: s.a, propertyId: s.property, jobId: s.job, category: "damage", severity: "low", note: "Synthetic", photoStorageId: evidence.storageId, uploadIntentId: evidence.uploadIntentId });
    expect((await s.t.query(api.queries.redFlags.listByJob, { ...auth(s, "owner"), jobId: s.job }))[0].photoUrl).toBeTruthy();
    const pdf = await upload(s, "owner", { kind: "onboardingPdf", documentKey: "synthetic" });
    await s.t.mutation(api.mutations.companyOnboardingDocuments.attachPdf, { ...auth(s, "owner"), documentKey: "synthetic", ...pdf });
    expect((await s.t.query(api.queries.companyOnboardingDocuments.listForWorker, auth(s, "worker"))).find(d => d.documentKey === "synthetic")?.url).toBeTruthy();
    await expect(s.t.query(api.queries.jobs.get, { ...auth(s, "foreign"), jobId: s.job })).rejects.toThrow("Access denied");
    await expect(s.t.query(api.queries.forms.getItems, { ...auth(s, "foreign"), formId: s.form })).rejects.toThrow("Access denied");
    expect(await s.t.query(api.queries.inspections.getByJob, { ...auth(s, "foreign"), jobId: s.job })).toEqual([]);
    await expect(s.t.query(api.queries.redFlags.listByJob, { ...auth(s, "foreign"), jobId: s.job })).rejects.toThrow("Access denied");
    expect((await s.t.query(api.queries.companyOnboardingDocuments.listForOwner, auth(s, "foreign"))).find(d => d.documentKey === "synthetic")).toBeUndefined();
  });

  it.each(["formPhoto", "formItemPhoto", "inspectionPhoto", "redFlagPhoto", "onboardingPdf"] as const)("rejects foreign/unbound IDs at the %s committing boundary without changing the parent", async kind => {
    const s = await setup();
    const target: AttachmentTarget = kind === "formPhoto" ? { kind, formId: s.form } : kind === "formItemPhoto" ? { kind, itemId: s.item } : kind === "onboardingPdf" ? { kind, documentKey: "synthetic" } : { kind, jobId: s.job };
    const token = kind === "inspectionPhoto" ? "manager" : kind === "onboardingPdf" ? "owner" : "worker";
    const own = await upload(s, token, target);
    const foreign = await upload(s, "foreignWorker", { kind: "formPhoto", formId: s.foreignForm });
    const call = (storageId: typeof own.storageId, uploadIntentId?: typeof own.uploadIntentId) => {
      if (kind === "formPhoto") return s.t.mutation(api.mutations.forms.addPhoto, { ...auth(s, token), formId: s.form, photoStorageId: storageId, uploadIntentId: uploadIntentId! });
      if (kind === "formItemPhoto") return s.t.mutation(api.mutations.forms.updateItem, { ...auth(s, token), itemId: s.item, photoStorageId: storageId, uploadIntentId });
      if (kind === "inspectionPhoto") return s.t.mutation(api.mutations.inspections.submit, { ...auth(s, token), jobId: s.job, severity: "none", readinessScore: 9, photoStorageIds: [storageId], photoUploadIntentIds: uploadIntentId ? [uploadIntentId] : undefined });
      if (kind === "redFlagPhoto") return s.t.mutation(api.mutations.redFlags.create, { ...auth(s, token), companyId: s.a, propertyId: s.property, jobId: s.job, category: "damage", severity: "low", note: "Synthetic", photoStorageId: storageId, uploadIntentId });
      return s.t.mutation(api.mutations.companyOnboardingDocuments.attachPdf, { ...auth(s, token), documentKey: "synthetic", storageId, uploadIntentId: uploadIntentId! });
    };
    await expect(call(foreign.storageId, foreign.uploadIntentId)).rejects.toThrow("unavailable");
    await expect(call(foreign.storageId, own.uploadIntentId)).rejects.toThrow("not bound");
    await expect(call(foreign.storageId)).rejects.toThrow();
    expect((await s.t.query(api.queries.jobs.get, { ...auth(s, "owner"), jobId: s.job }))?.form?.photoUrls).toEqual([]);
    expect((await s.t.query(api.queries.forms.getItems, { ...auth(s, "owner"), formId: s.form }))[0].photoUrl).toBeNull();
    expect(await s.t.query(api.queries.inspections.getByJob, { ...auth(s, "owner"), jobId: s.job })).toEqual([]);
    expect(await s.t.query(api.queries.redFlags.listByJob, { ...auth(s, "owner"), jobId: s.job })).toEqual([]);
    expect((await s.t.query(api.queries.companyOnboardingDocuments.listForOwner, auth(s, "owner"))).find(d => d.documentKey === "synthetic")).toBeUndefined();
    expect((await s.t.run(ctx => ctx.db.get(own.uploadIntentId)))?.status).toBe("pending");
  });

  it("binds purpose, exact resource and uploader, and makes consumption single-use", async () => {
    const s = await setup();
    const uploadA = await upload(s, "worker", { kind: "formPhoto", formId: s.form });
    const commit = (formId = s.form, name = "worker") => s.t.mutation(api.mutations.forms.addPhoto, { ...auth(s, name), formId, photoStorageId: uploadA.storageId, uploadIntentId: uploadA.uploadIntentId });
    await expect(commit(s.otherForm)).rejects.toThrow("unavailable");
    await expect(commit(s.form, "manager")).rejects.toThrow("unavailable");
    await expect(s.t.mutation(api.mutations.forms.updateItem, { ...auth(s, "worker"), itemId: s.item, photoStorageId: uploadA.storageId, uploadIntentId: uploadA.uploadIntentId })).rejects.toThrow("unavailable");
    await commit();
    await expect(commit()).rejects.toThrow("unavailable");
    expect((await s.t.query(api.queries.jobs.get, { ...auth(s, "owner"), jobId: s.job }))?.form?.photoStorageIds).toEqual([uploadA.storageId]);
  });

  it("rechecks manager document capability after issuance and rejects client sessions", async () => {
    const s = await setup();
    await s.t.run(ctx => ctx.db.patch(s.staff.manager, { canManageDocuments: true }));
    const pdf = await upload(s, "manager", { kind: "onboardingPdf", documentKey: "synthetic" });
    await s.t.run(async ctx => {
      await ctx.db.patch(s.staff.manager, { canManageDocuments: false });
      const clientUserId = await ctx.db.insert("clientUsers", { email: "client@attachment.test", displayName: "Synthetic", status: "active", createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("authSessions", { clientUserId, principalType: "client", tokenHash: hashToken("client"), version: 1, createdAt: Date.now(), lastUsedAt: Date.now(), expiresAt: Date.now() + 3600000, idleExpiresAt: Date.now() + 3600000 });
    });
    await expect(s.t.mutation(api.mutations.companyOnboardingDocuments.attachPdf, { ...auth(s, "manager"), documentKey: "synthetic", ...pdf })).rejects.toThrow("canManageDocuments");
    await expect(upload(s, "client", { kind: "formPhoto", formId: s.form })).rejects.toThrow("verified session");
    await expect(s.t.query(api.queries.jobs.get, { ...auth(s, "worker"), sessionToken: "client", jobId: s.job })).rejects.toThrow("verified session");
    expect((await s.t.run(ctx => ctx.db.get(pdf.uploadIntentId)))?.status).toBe("pending");
  });

  it("supports maintenance and team-assigned photo uploads but rejects a removed team member", async () => {
    const s = await setup();
    await s.t.run(ctx => ctx.db.patch(s.otherJob, { type: "maintenance", cleanerIds: [s.staff.maintenance] }));
    const maintenance = await upload(s, "maintenance", { kind: "formPhoto", formId: s.otherForm });
    await s.t.mutation(api.mutations.forms.addPhoto, { ...auth(s, "maintenance"), formId: s.otherForm, photoStorageId: maintenance.storageId, uploadIntentId: maintenance.uploadIntentId });
    expect((await s.t.query(api.queries.jobs.get, { ...auth(s, "maintenance"), jobId: s.otherJob }))?.form?.photoUrls).toHaveLength(1);
    const membership = await s.t.run(async ctx => {
      const team = await ctx.db.insert("teams", { companyId: s.a, name: "Synthetic", active: true, createdBy: s.staff.owner, createdAt: 1, updatedAt: 1 });
      await ctx.db.patch(s.job, { cleanerIds: [], assignedTeamId: team });
      return ctx.db.insert("teamMembers", { companyId: s.a, teamId: team, userId: s.staff.worker, active: true, role: "member", addedAt: 1 });
    });
    const teamUpload = await upload(s, "worker", { kind: "formPhoto", formId: s.form });
    await s.t.run(ctx => ctx.db.patch(membership, { active: false }));
    await expect(s.t.mutation(api.mutations.forms.addPhoto, { ...auth(s, "worker"), formId: s.form, photoStorageId: teamUpload.storageId, uploadIntentId: teamUpload.uploadIntentId })).rejects.toThrow("Not assigned");
    expect(await s.t.query(api.queries.jobs.get, { ...auth(s, "worker"), jobId: s.job })).toBeNull();
  });

  it("rechecks worker assignment and manager scope after issuance, including reads", async () => {
    const s = await setup();
    await expect(upload(s, "unassigned", { kind: "formPhoto", formId: s.form })).rejects.toThrow("Not assigned");
    await expect(upload(s, "restricted", { kind: "inspectionPhoto", jobId: s.job })).rejects.toThrow("Access denied");
    const photo = await upload(s, "worker", { kind: "formPhoto", formId: s.form });
    const inspection = await upload(s, "manager", { kind: "inspectionPhoto", jobId: s.job });
    await s.t.run(ctx => ctx.db.patch(s.job, { cleanerIds: [], assignedManagerId: undefined }));
    await expect(s.t.mutation(api.mutations.forms.addPhoto, { ...auth(s, "worker"), formId: s.form, photoStorageId: photo.storageId, uploadIntentId: photo.uploadIntentId })).rejects.toThrow("Not assigned");
    await expect(s.t.mutation(api.mutations.inspections.submit, { ...auth(s, "manager"), jobId: s.job, severity: "none", readinessScore: 9, photoStorageIds: [inspection.storageId], photoUploadIntentIds: [inspection.uploadIntentId] })).rejects.toThrow("Access denied");
    expect(await s.t.query(api.queries.jobs.get, { ...auth(s, "worker"), jobId: s.job })).toBeNull();
    expect(await s.t.query(api.queries.inspections.getByJob, { ...auth(s, "manager"), jobId: s.job })).toEqual([]);
  });

  it.each(["revoked", "expired", "inactive", "invalid", "missing"])("denies %s sessions at issuance, commit and protected URL projections", async state => {
    const s = await setup();
    const photo = await upload(s, "worker", { kind: "formPhoto", formId: s.form });
    await s.t.run(async ctx => {
      const session = await ctx.db.query("authSessions").withIndex("by_tokenHash", q => q.eq("tokenHash", hashToken("worker"))).unique();
      if (state === "revoked") await ctx.db.patch(session!._id, { revokedAt: Date.now() });
      if (state === "expired") await ctx.db.patch(session!._id, { expiresAt: 1 });
      if (state === "inactive") await ctx.db.patch(s.staff.worker, { status: "inactive" });
    });
    const sessionToken = state === "invalid" ? "invalid" : state === "missing" ? "" : "worker";
    await expect(s.t.mutation(api.attachmentUploads.begin, { sessionToken, target: { kind: "formPhoto", formId: s.form }, mimeType: "image/jpeg" })).rejects.toThrow("verified session");
    await expect(s.t.mutation(api.mutations.forms.addPhoto, { ...auth(s, "worker"), sessionToken, formId: s.form, photoStorageId: photo.storageId, uploadIntentId: photo.uploadIntentId })).rejects.toThrow("verified session");
    await expect(s.t.query(api.queries.jobs.get, { ...auth(s, "worker"), sessionToken, jobId: s.job })).rejects.toThrow("verified session");
    await expect(s.t.query(api.queries.companyOnboardingDocuments.listForWorker, { ...auth(s, "worker"), sessionToken })).rejects.toThrow("verified session");
  });

  it("keeps legacy references readable, preserves onboarding visibility and never adopts an old ID", async () => {
    const s = await setup();
    const legacy = await s.t.run(async ctx => {
      const storageId = await ctx.storage.store(new Blob(["legacy synthetic"]));
      await ctx.db.patch(s.form, { photoStorageIds: [storageId] });
      await ctx.db.insert("companyOnboardingDocuments", { companyId: s.a, documentKey: "legacy", storageId, title: "Synthetic", required: true, roleVisibility: "maintenance", status: "active", createdAt: 1, updatedAt: 1 });
      return storageId;
    });
    expect((await s.t.query(api.queries.jobs.get, { ...auth(s, "worker"), jobId: s.job }))?.form?.photoUrls).toHaveLength(1);
    expect((await s.t.query(api.queries.companyOnboardingDocuments.listForWorker, auth(s, "worker"))).find(d => d.documentKey === "legacy")).toBeUndefined();
    expect((await s.t.query(api.queries.companyOnboardingDocuments.listForWorker, auth(s, "maintenance"))).find(d => d.documentKey === "legacy")?.url).toBeTruthy();
    await s.t.mutation(api.mutations.companyOnboardingDocuments.upsertMetadata, { ...auth(s, "owner"), documentKey: "legacy", title: "Synthetic", required: true, roleVisibility: "both", status: "inactive" });
    expect((await s.t.query(api.queries.companyOnboardingDocuments.listForWorker, auth(s, "maintenance"))).find(d => d.documentKey === "legacy")).toBeUndefined();
    const own = await upload(s, "worker", { kind: "formPhoto", formId: s.otherForm });
    await expect(s.t.mutation(api.mutations.forms.addPhoto, { ...auth(s, "worker"), formId: s.otherForm, photoStorageId: legacy, uploadIntentId: own.uploadIntentId })).rejects.toThrow("not bound");
    const before = await s.t.run(ctx => ctx.db.query("attachmentUploadIntents").collect());
    const result = await s.t.query(inventory, { source: "forms", paginationOpts: { cursor: null, numItems: 25 } }) as any;
    expect(result.page).toContainEqual({ companyId: s.a, resourceId: s.form, storageId: legacy, provenance: "legacy_unverified" });
    expect(await s.t.run(ctx => ctx.db.query("attachmentUploadIntents").collect())).toEqual(before);
  });

  it("returns partner photo URLs only for an explicit completed package with valid job/company links", async () => {
    const s = await setup();
    const share = await s.t.run(async ctx => {
      const storageId = await ctx.storage.store(new Blob(["legacy shared synthetic"]));
      await ctx.db.patch(s.foreignJob, { sharedFromJobId: s.job });
      return ctx.db.insert("sharedJobs", { fromCompanyId: s.a, toCompanyId: s.b, originalJobId: s.job, copiedJobId: s.foreignJob, sharePackage: true, status: "completed", photoStorageIds: [storageId] });
    });
    const read = () => s.t.query(api.queries.partners.getSharedJobStatus, { ...auth(s, "owner"), jobId: s.job });
    expect((await read())[0].photoUrls).toHaveLength(1);
    await expect(s.t.query(api.queries.partners.getSharedJobStatus, { ...auth(s, "unrelated"), jobId: s.job })).rejects.toThrow("Access denied");
    await s.t.run(ctx => ctx.db.patch(share, { sharePackage: false }));
    expect((await read())[0].photoUrls).toEqual([]);
    expect((await read())[0].photoStorageIds).toBeUndefined();
    await s.t.run(ctx => ctx.db.patch(share, { sharePackage: true, status: "rejected" }));
    expect((await read())[0].photoUrls).toEqual([]);
    await s.t.run(ctx => ctx.db.patch(share, { status: "completed", toCompanyId: s.c }));
    expect((await read())[0].photoUrls).toEqual([]);
  });

  it("rejects expiry, missing/deleted files, invalid metadata and incomplete inspection batches atomically", async () => {
    const s = await setup();
    const first = await upload(s, "manager", { kind: "inspectionPhoto", jobId: s.job });
    const second = await upload(s, "manager", { kind: "inspectionPhoto", jobId: s.job });
    await s.t.run(ctx => ctx.db.patch(second.uploadIntentId, { expiresAt: 1 }));
    await expect(s.t.mutation(api.mutations.inspections.submit, { ...auth(s, "manager"), jobId: s.job, severity: "none", readinessScore: 9, photoStorageIds: [first.storageId, second.storageId], photoUploadIntentIds: [first.uploadIntentId, second.uploadIntentId] })).rejects.toThrow("unavailable");
    expect((await s.t.run(ctx => ctx.db.get(first.uploadIntentId)))?.status).toBe("pending");
    expect(await s.t.query(api.queries.inspections.getByJob, { ...auth(s, "owner"), jobId: s.job })).toEqual([]);
    const photo = await upload(s, "worker", { kind: "formPhoto", formId: s.form });
    await s.t.run(ctx => ctx.storage.delete(photo.storageId));
    await expect(s.t.mutation(api.mutations.forms.addPhoto, { ...auth(s, "worker"), formId: s.form, photoStorageId: photo.storageId, uploadIntentId: photo.uploadIntentId })).rejects.toThrow("not bound");
    await expect(s.t.mutation(api.attachmentUploads.begin, { sessionToken: "worker", target: { kind: "formPhoto", formId: s.form }, mimeType: "application/pdf" })).rejects.toThrow("Unsupported");
  });
});
