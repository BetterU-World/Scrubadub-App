import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import { hashPassword } from "../password";

const modules = import.meta.glob("../../**/*.ts");
const password = "test-password-123";
const assignments = (api as any).mutations.clientResourceAssignments;
const assignmentQueries = (api as any).queries.clientResourceAssignments;
const clientResources = (api as any).queries.clientResources;
const library = (api as any).mutations.companyResources;
const pdf = new TextEncoder().encode("%PDF-1.4\n%%EOF\n");

const storageBodies = new Map<string, Uint8Array>();
const nativeFetch = globalThis.fetch;
beforeEach(() => {
  process.env.TOKEN_PEPPER = "e2-test-pepper"; process.env.APP_URL = "http://localhost:5173";
  storageBodies.clear();
  vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
    if (!String(input).startsWith("https://some-deployment.convex.cloud/api/storage/")) return nativeFetch(input, init);
    const bytes = storageBodies.get(String(input).split("/api/storage/")[1]);
    const match = /^bytes=(\d+)-(\d+)$/.exec(new Headers(init?.headers).get("Range") ?? "");
    if (!bytes || !match) return new Response(null, { status: 404 });
    const start = Number(match[1]); const end = Number(match[2]);
    if (end >= bytes.length) return new Response(null, { status: 416 });
    return new Response(bytes.slice(start, end + 1), { status: 206, headers: { "Content-Range": `bytes ${start}-${end}/${bytes.length}` } });
  });
});
afterEach(() => vi.unstubAllGlobals());

async function setup() {
  const t = convexTest(schema, modules);
  const passwordHash = await hashPassword(password);
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "First company", timezone: "America/New_York" });
    const otherCompanyId = await ctx.db.insert("companies", { name: "Second company", timezone: "America/New_York" });
    const staff = {} as Record<string, any>;
    for (const [name, company, role, capabilities] of [
      ["owner", companyId, "owner", {}], ["clients", companyId, "manager", { canManageClients: true }],
      ["docs", companyId, "manager", { canManageDocuments: true }], ["sales", companyId, "manager", { canManageSalesAndCommercial: true }],
      ["team", companyId, "manager", { canManageTeam: true }],
      ["other", otherCompanyId, "owner", {}],
    ] as const) {
      staff[name] = await ctx.db.insert("users", { companyId: company, email: `e2-${name}@example.test`, passwordHash, name, role, status: "active", ...capabilities });
    }
    const clientUserId = await ctx.db.insert("clientUsers", { email: "e2-client@example.test", passwordHash, displayName: "Client", status: "active", createdAt: 1, updatedAt: 1 });
    const pendingUserId = await ctx.db.insert("clientUsers", { email: "e2-pending@example.test", passwordHash, displayName: "Pending", status: "pending", createdAt: 1, updatedAt: 1 });
    const relationshipId = await ctx.db.insert("clientRelationships", { companyId, clientUserId, displayName: "Client A", clientType: "residential", status: "active", createdAt: 1, updatedAt: 1 });
    const secondRelationshipId = await ctx.db.insert("clientRelationships", { companyId, clientUserId, displayName: "Client B", clientType: "commercial", status: "active", createdAt: 1, updatedAt: 1 });
    const prePortalId = await ctx.db.insert("clientRelationships", { companyId, displayName: "Before invitation", clientType: "residential", status: "active", createdAt: 1, updatedAt: 1 });
    const foreignRelationshipId = await ctx.db.insert("clientRelationships", { companyId: otherCompanyId, displayName: "Foreign", clientType: "residential", status: "active", createdAt: 1, updatedAt: 1 });
    const pendingRelationshipId = await ctx.db.insert("clientRelationships", { companyId, clientUserId: pendingUserId, displayName: "Pending", clientType: "residential", status: "active", createdAt: 1, updatedAt: 1 });
    const makeResource = async (company: typeof companyId, title: string) => {
      const storageId = await ctx.storage.store(new Blob([pdf], { type: "application/pdf" }));
      const stored = await ctx.db.system.get("_storage", storageId);
      storageBodies.set(stored!.sha256, pdf);
      return ctx.db.insert("companyResources", { companyId: company, title, storageId, originalFileName: `${title}.pdf`, mimeType: "application/pdf", sizeBytes: pdf.length, status: "active", createdAt: 1, updatedAt: 1, createdByUserId: staff[company === companyId ? "owner" : "other"], updatedByUserId: staff[company === companyId ? "owner" : "other"], lastUploadRequestId: `${company}-${title}` });
    };
    const guideId = await makeResource(companyId, "Guide");
    const policyId = await makeResource(companyId, "Policy");
    const foreignResourceId = await makeResource(otherCompanyId, "Foreign guide");
    return { companyId, otherCompanyId, staff, clientUserId, pendingUserId, relationshipId, secondRelationshipId, prePortalId, foreignRelationshipId, pendingRelationshipId, guideId, policyId, foreignResourceId };
  });
  const tokens: Record<string, string> = {};
  for (const name of ["owner", "clients", "docs", "sales", "team", "other"]) {
    tokens[name] = (await t.action(api.authActions.signIn, { email: `e2-${name}@example.test`, password })).sessionToken;
  }
  tokens.client = (await t.action(api.clientAuthActions.signIn, { email: "e2-client@example.test", password })).sessionToken;
  return { t, ...ids, tokens };
}

function read(t: ReturnType<typeof convexTest>, token: string, resourceId: string, download = false, length = pdf.length) {
  return t.fetch(`/client/resources/file?resourceId=${resourceId}${download ? "&download=1" : ""}`, { headers: { Origin: "http://localhost:5173", Authorization: `Bearer ${token}`, Range: `bytes=0-${length - 1}` } });
}

describe("Client Resources", () => {
  it("enforces client-management permission, same-company active state, and atomic bulk validation", async () => {
    const s = await setup();
    for (const role of ["docs", "sales", "team"]) {
      await expect(s.t.query(assignmentQueries.listActiveForPicker, { sessionToken: s.tokens[role] })).rejects.toThrow();
      await expect(s.t.mutation(assignments.addResourcesToClient, { sessionToken: s.tokens[role], clientRelationshipId: s.relationshipId, resourceIds: [s.guideId] })).rejects.toThrow();
    }
    expect((await s.t.query(assignmentQueries.listActiveForPicker, { sessionToken: s.tokens.other }) as any).rows).toMatchObject([{ title: "Foreign guide" }]);
    expect((await s.t.query(assignmentQueries.listActiveForPicker, { sessionToken: s.tokens.clients }) as any).rows).toMatchObject([{ title: "Policy" }, { title: "Guide" }]);
    await expect(s.t.mutation(assignments.addResourcesToClient, { sessionToken: s.tokens.clients, clientRelationshipId: s.foreignRelationshipId, resourceIds: [s.guideId] })).rejects.toThrow();
    await expect(s.t.mutation(assignments.addResourcesToClient, { sessionToken: s.tokens.clients, clientRelationshipId: s.relationshipId, resourceIds: [s.guideId, s.foreignResourceId] })).rejects.toThrow();
    expect((await s.t.query(assignmentQueries.listForRelationship, { sessionToken: s.tokens.clients, clientRelationshipId: s.relationshipId }) as any).rows).toHaveLength(0);
    await s.t.mutation(library.archive, { sessionToken: s.tokens.owner, resourceId: s.policyId });
    await expect(s.t.mutation(assignments.addResourcesToClient, { sessionToken: s.tokens.clients, clientRelationshipId: s.relationshipId, resourceIds: [s.policyId] })).rejects.toThrow();
    await s.t.run((ctx) => ctx.db.patch(s.relationshipId, { status: "inactive" }));
    await expect(s.t.mutation(assignments.addResourcesToClient, { sessionToken: s.tokens.clients, clientRelationshipId: s.relationshipId, resourceIds: [s.guideId] })).rejects.toThrow();
    await s.t.mutation(assignments.addResourcesToClient, { sessionToken: s.tokens.clients, clientRelationshipId: s.prePortalId, resourceIds: [s.guideId] });
    expect((await s.t.query(assignmentQueries.listForRelationship, { sessionToken: s.tokens.clients, clientRelationshipId: s.prePortalId }) as any).rows).toHaveLength(1);
    await expect(s.t.query(assignmentQueries.countsForResources, { sessionToken: s.tokens.clients, resourceIds: [s.guideId] })).rejects.toThrow();
    expect((await s.t.query(assignmentQueries.countsForResources, { sessionToken: s.tokens.docs, resourceIds: [s.guideId] }) as any)[s.guideId].count).toBe(1);
  });

  it("deduplicates retries and multiple relationships, then revokes only the selected relationship", async () => {
    const s = await setup();
    const args = { sessionToken: s.tokens.clients, clientRelationshipId: s.relationshipId, resourceIds: [s.guideId, s.policyId, s.guideId] };
    expect(await s.t.mutation(assignments.addResourcesToClient, args)).toMatchObject({ added: 2, alreadyShared: 0 });
    expect(await s.t.mutation(assignments.addResourcesToClient, args)).toMatchObject({ added: 0, alreadyShared: 2 });
    await s.t.mutation(assignments.addResourcesToClient, { ...args, clientRelationshipId: s.secondRelationshipId, resourceIds: [s.guideId] });
    expect((await s.t.query(clientResources.listVisible, { sessionToken: s.tokens.client }) as any).rows.map((row: any) => row.title)).toEqual(["Guide", "Policy"]);
    expect((await s.t.query(assignmentQueries.countsForResources, { sessionToken: s.tokens.docs, resourceIds: [s.guideId] }) as any)[s.guideId].count).toBe(2);
    expect((await read(s.t, s.tokens.client, s.guideId)).status).toBe(206);
    expect((await read(s.t, s.tokens.client, s.guideId, true)).headers.get("content-range")).toBe(`bytes 0-${pdf.length - 1}/${pdf.length}`);
    await s.t.mutation(assignments.removeAccess, { sessionToken: s.tokens.clients, clientRelationshipId: s.relationshipId, resourceId: s.guideId });
    expect((await read(s.t, s.tokens.client, s.guideId)).status).toBe(206);
    expect(await s.t.mutation(assignments.removeAccess, { sessionToken: s.tokens.clients, clientRelationshipId: s.secondRelationshipId, resourceId: s.guideId })).toMatchObject({ removed: true });
    expect((await read(s.t, s.tokens.client, s.guideId)).status).toBe(403);
    expect((await s.t.query(clientResources.listVisible, { sessionToken: s.tokens.client }) as any).rows.map((row: any) => row.title)).toEqual(["Policy"]);
    expect(await s.t.mutation(assignments.removeAccess, { sessionToken: s.tokens.clients, clientRelationshipId: s.secondRelationshipId, resourceId: s.guideId })).toMatchObject({ removed: false });
  }, 10_000);

  it("gates every file read by current session, relationship, resource, and assignment state", async () => {
    const s = await setup();
    expect((await read(s.t, s.tokens.client, s.guideId)).status).toBe(403);
    await s.t.mutation(assignments.addResourcesToClient, { sessionToken: s.tokens.owner, clientRelationshipId: s.relationshipId, resourceIds: [s.guideId] });
    const valid = await read(s.t, s.tokens.client, s.guideId);
    expect(valid.status).toBe(206);
    expect(new Uint8Array(await valid.arrayBuffer())).toEqual(pdf);
    for (const token of [s.tokens.owner, s.tokens.clients]) expect((await read(s.t, token, s.guideId)).status).toBe(403);
    expect((await read(s.t, s.tokens.client, s.foreignResourceId)).status).toBe(403);
    expect((await s.t.fetch(`/client/resources/file?resourceId=${s.guideId}`, { headers: { Origin: "http://localhost:5173" } })).status).toBe(401);
    expect((await read(s.t, s.tokens.client, "not-a-resource-id")).status).toBe(403);
    await s.t.run((ctx) => ctx.db.patch(s.relationshipId, { clientUserId: s.pendingUserId }));
    expect((await read(s.t, s.tokens.client, s.guideId)).status).toBe(403);
    await s.t.run((ctx) => ctx.db.patch(s.relationshipId, { clientUserId: s.clientUserId }));
    expect((await s.t.fetch(`/client/resources/file?resourceId=${s.guideId}`, { headers: { Origin: "https://evil.example", Authorization: `Bearer ${s.tokens.client}` } })).status).toBe(403);
    await s.t.run((ctx) => ctx.db.patch(s.relationshipId, { status: "inactive" }));
    expect((await read(s.t, s.tokens.client, s.guideId)).status).toBe(403);
    expect((await s.t.query(clientResources.listVisible, { sessionToken: s.tokens.client }) as any).rows).toHaveLength(0);
    await s.t.run((ctx) => ctx.db.patch(s.relationshipId, { status: "active" }));
    expect((await read(s.t, s.tokens.client, s.guideId)).status).toBe(206);
    await s.t.mutation(library.archive, { sessionToken: s.tokens.owner, resourceId: s.guideId });
    expect((await read(s.t, s.tokens.client, s.guideId)).status).toBe(403);
    await s.t.mutation(library.restore, { sessionToken: s.tokens.owner, resourceId: s.guideId });
    expect((await read(s.t, s.tokens.client, s.guideId)).status).toBe(206);
    await s.t.run((ctx) => ctx.db.patch(s.clientUserId, { status: "disabled" }));
    expect((await read(s.t, s.tokens.client, s.guideId)).status).toBe(403);
  }, 10_000);

  it("retains assignments through replacement and blocks deletion until every access grant is removed", async () => {
    const s = await setup();
    await s.t.mutation(assignments.addResourcesToClient, { sessionToken: s.tokens.owner, clientRelationshipId: s.relationshipId, resourceIds: [s.guideId] });
    const original = await s.t.run((ctx) => ctx.db.get(s.guideId));
    const replacement = new TextEncoder().encode("%PDF-1.4\nNew guide\n%%EOF\n");
    const intent = await s.t.mutation((api as any).mutations.resourceUploadIntents.begin, {
      sessionToken: s.tokens.docs, requestId: "e2-replace-1234", resourceId: s.guideId,
      expectedStorageId: original!.storageId, title: "New guide", originalFileName: "new.pdf", declaredMimeType: "application/pdf",
    });
    const newStorageId = await s.t.run((ctx) => ctx.storage.store(new Blob([replacement], { type: `application/pdf; scrub-intent=${intent.nonce}` })));
    await s.t.run((ctx) => ctx.db.patch(newStorageId, { contentType: `application/pdf; scrub-intent=${intent.nonce}` }));
    const stored = await s.t.run((ctx) => ctx.db.system.get("_storage", newStorageId));
    storageBodies.set(stored!.sha256, replacement);
    await s.t.mutation((api as any).mutations.resourceUploadIntents.registerCandidate, { sessionToken: s.tokens.docs, intentId: intent.intentId, storageId: newStorageId });
    await s.t.mutation((internal as any).mutations.companyResources.finalizeUpload, {
      sessionToken: s.tokens.docs, intentId: intent.intentId, requestId: "e2-replace-1234", resourceId: s.guideId,
      expectedStorageId: original!.storageId, storageId: newStorageId, title: "New guide", originalFileName: "new.pdf", mimeType: "application/pdf", sizeBytes: replacement.length,
    });
    const current = await read(s.t, s.tokens.client, s.guideId, false, replacement.length);
    expect(new Uint8Array(await current.arrayBuffer())).toEqual(replacement);
    expect((await s.t.query(clientResources.listVisible, { sessionToken: s.tokens.client }) as any).rows[0]).toMatchObject({ title: "New guide", originalFileName: "new.pdf" });
    await s.t.mutation(library.archive, { sessionToken: s.tokens.owner, resourceId: s.guideId });
    await s.t.run((ctx) => ctx.db.patch(s.relationshipId, { status: "inactive" }));
    await expect(s.t.mutation(library.deleteArchived, { sessionToken: s.tokens.docs, resourceId: s.guideId })).rejects.toThrow("Remove client access");
    expect(await s.t.run((ctx) => ctx.db.system.get("_storage", newStorageId))).not.toBeNull();
    await s.t.mutation(assignments.removeAccess, { sessionToken: s.tokens.clients, clientRelationshipId: s.relationshipId, resourceId: s.guideId });
    await s.t.mutation(library.deleteArchived, { sessionToken: s.tokens.docs, resourceId: s.guideId });
    expect(await s.t.run((ctx) => ctx.db.system.get("_storage", newStorageId))).toBeNull();
  });
});
