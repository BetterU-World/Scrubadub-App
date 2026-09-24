import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";
import { cleanResourceFilename, detectResourceMime, validateResourceFile } from "../companyResources";

const modules = import.meta.glob("../../**/*.ts");
const password = "test-password-123";
const resources = (api as any).queries.companyResources;
const mutations = (api as any).mutations.companyResources;
const pdf = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 0xff, 0xd9]);
const png = (() => { const bytes = new Uint8Array(45); bytes.set([137,80,78,71,13,10,26,10], 0); bytes.set([73,72,68,82], 12); bytes[19] = 1; bytes[23] = 1; bytes.set([73,69,78,68], 37); return bytes; })();
const webp = (() => { const bytes = new Uint8Array(24); bytes.set([82,73,70,70,16,0,0,0,87,69,66,80,86,80,56,32,4,0,0,0,1,2,3,4]); return bytes; })();

beforeEach(() => { process.env.TOKEN_PEPPER = "e1-test-pepper"; process.env.APP_URL = "http://localhost:5173"; });

async function setup() {
  const t = convexTest(schema, modules);
  const passwordHash = await hashPassword(password);
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "E1 Co", timezone: "America/New_York" });
    const otherCompanyId = await ctx.db.insert("companies", { name: "Other Co", timezone: "America/New_York" });
    const ownerId = await ctx.db.insert("users", { companyId, email: "e1-owner@example.test", passwordHash, name: "Owner", role: "owner", status: "active" });
    const docsId = await ctx.db.insert("users", { companyId, email: "e1-docs@example.test", passwordHash, name: "Docs", role: "manager", status: "active", canManageDocuments: true });
    const salesId = await ctx.db.insert("users", { companyId, email: "e1-sales@example.test", passwordHash, name: "Sales", role: "manager", status: "active", canManageSalesAndCommercial: true });
    const teamId = await ctx.db.insert("users", { companyId, email: "e1-team@example.test", passwordHash, name: "Team", role: "manager", status: "active", canManageTeam: true });
    const clientsId = await ctx.db.insert("users", { companyId, email: "e1-clients@example.test", passwordHash, name: "Clients", role: "manager", status: "active", canManageClients: true });
    const otherId = await ctx.db.insert("users", { companyId: otherCompanyId, email: "e1-other@example.test", passwordHash, name: "Other", role: "owner", status: "active" });
    return { companyId, ownerId, docsId, salesId, teamId, clientsId, otherId };
  });
  const names = ["owner", "docs", "sales", "team", "clients", "other"];
  const sessions = await Promise.all(names.map((name) => t.action(api.authActions.signIn, { email: `e1-${name}@example.test`, password })));
  return { t, ...ids, tokens: Object.fromEntries(names.map((name, index) => [name, sessions[index].sessionToken])) as Record<string, string> };
}

function upload(t: ReturnType<typeof convexTest>, token: string, bytes: Uint8Array = pdf, options: { requestId?: string; filename?: string; type?: string; title?: string; resourceId?: string; expectedStorageId?: string } = {}) {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: options.type ?? "application/pdf" }), options.filename ?? "guide.pdf");
  form.append("title", options.title ?? " Guide ");
  form.append("requestId", options.requestId ?? "request-1234");
  if (options.resourceId) form.append("resourceId", options.resourceId);
  if (options.expectedStorageId) form.append("expectedStorageId", options.expectedStorageId);
  return t.fetch("/resources/upload", { method: "POST", headers: { Origin: "http://localhost:5173", Authorization: `Bearer ${token}` }, body: form });
}

describe("Resource file validation", () => {
  it("recognizes all four approved signatures and rejects mismatches", () => {
    for (const [bytes, type, name] of [[pdf, "application/pdf", "a.pdf"], [jpeg, "image/jpeg", "a.jpg"], [png, "image/png", "a.png"], [webp, "image/webp", "a.webp"]] as const) {
      expect(detectResourceMime(bytes)).toBe(type);
      expect(validateResourceFile(bytes, type, name).mimeType).toBe(type);
    }
    expect(() => validateResourceFile(pdf, "image/png", "a.png")).toThrow();
    expect(validateResourceFile(pdf, "", "a.pdf").mimeType).toBe("application/pdf");
    expect(() => validateResourceFile(pdf, "application/pdf", "a.docx")).toThrow();
    expect(() => validateResourceFile(new TextEncoder().encode("<svg></svg>"), "image/svg+xml", "a.svg")).toThrow();
    expect(() => validateResourceFile(new Uint8Array(), "application/pdf", "a.pdf")).toThrow();
    expect(() => validateResourceFile(new Uint8Array(10 * 1024 * 1024 + 1), "application/pdf", "a.pdf")).toThrow();
    expect(() => validateResourceFile(new Uint8Array(10 * 1024 * 1024), "application/pdf", "a.pdf")).toThrow("Unsupported");
  });
  it("sanitizes names without losing ordinary Unicode", () => {
    expect(cleanResourceFilename("C:\\fake\\Guía\u202e.pdf")).toBe("Guía.pdf");
    expect(cleanResourceFilename("a".repeat(200) + ".pdf").length).toBe(180);
    const boundary = new Uint8Array(10 * 1024 * 1024);
    boundary.set(pdf.slice(0, 5));
    boundary.set(new TextEncoder().encode("%%EOF"), boundary.length - 5);
    expect(validateResourceFile(boundary, "application/pdf", "large.pdf").sizeBytes).toBe(boundary.length);
  });
});

describe("Company Resource lifecycle", () => {
  it("rejects invalid uploads and untrusted origins before creating a record", async () => {
    const s = await setup();
    for (const [bytes, options] of [
      [new Uint8Array(), {}],
      [new TextEncoder().encode("<svg></svg>"), { filename: "bad.svg", type: "image/svg+xml" }],
      [pdf, { filename: "bad.png", type: "image/png" }],
      [pdf, { filename: "bad.pdf", type: "image/png" }],
      [new Uint8Array(10 * 1024 * 1024 + 1), {}],
      [pdf, { title: " " }],
      [pdf, { title: "a".repeat(201) }],
    ] as Array<[Uint8Array, { filename?: string; type?: string; title?: string }]>) {
      expect((await upload(s.t, s.tokens.owner, bytes, { ...options, requestId: crypto.randomUUID() })).status).toBe(400);
    }
    expect((await s.t.query(resources.list, { sessionToken: s.tokens.owner, status: "active" }) as any).rows).toHaveLength(0);
    const form = new FormData();
    form.append("file", new Blob([pdf], { type: "application/pdf" }), "guide.pdf");
    expect((await s.t.fetch("/resources/upload", { method: "POST", headers: { Origin: "https://evil.example", Authorization: `Bearer ${s.tokens.owner}` }, body: form })).status).toBe(403);
  });

  it("allows document managers, denies unrelated roles, and keeps company isolation", async () => {
    const s = await setup();
    for (const name of ["sales", "team", "clients"]) {
      await expect(s.t.query(resources.list, { sessionToken: s.tokens[name], status: "active" })).rejects.toThrow();
      expect((await upload(s.t, s.tokens[name])).status).toBe(403);
    }
    expect((await s.t.query(resources.list, { sessionToken: s.tokens.docs, status: "active" }) as any).rows).toHaveLength(0);
    const created = await upload(s.t, s.tokens.owner);
    expect(created.status).toBe(200);
    const { resourceId } = await created.json() as any;
    const row = (await s.t.query(resources.list, { sessionToken: s.tokens.owner, status: "active" }) as any).rows[0];
    expect(row).toMatchObject({ _id: resourceId, title: "Guide", originalFileName: "guide.pdf", sizeBytes: pdf.length });
    expect((await s.t.query(resources.list, { sessionToken: s.tokens.docs, status: "active" }) as any).rows).toHaveLength(1);
    expect((await s.t.query(resources.list, { sessionToken: s.tokens.other, status: "active" }) as any).rows).toHaveLength(0);
    await expect(s.t.mutation(mutations.updateDetails, { sessionToken: s.tokens.other, resourceId, title: "Stolen" })).rejects.toThrow();
    await expect(s.t.mutation(mutations.archive, { sessionToken: s.tokens.other, resourceId })).rejects.toThrow();
    await expect(s.t.mutation(mutations.restore, { sessionToken: s.tokens.other, resourceId })).rejects.toThrow();
    await expect(s.t.mutation(mutations.deleteArchived, { sessionToken: s.tokens.other, resourceId })).rejects.toThrow();
    for (const name of ["sales", "team", "clients"]) {
      await expect(s.t.mutation(mutations.updateDetails, { sessionToken: s.tokens[name], resourceId, title: "Denied" })).rejects.toThrow();
      await expect(s.t.mutation(mutations.archive, { sessionToken: s.tokens[name], resourceId })).rejects.toThrow();
    }
    expect((await upload(s.t, s.tokens.other, pdf, { resourceId, expectedStorageId: row.storageId })).status).toBe(403);
    const read = await s.t.fetch(`/resources/file?resourceId=${resourceId}`, { headers: { Origin: "http://localhost:5173", Authorization: `Bearer ${s.tokens.docs}` } });
    expect(read.status).toBe(200);
    expect(new Uint8Array(await read.arrayBuffer())).toEqual(pdf);
    const downloaded = await s.t.fetch(`/resources/file?resourceId=${resourceId}&download=1`, { headers: { Origin: "http://localhost:5173", Authorization: `Bearer ${s.tokens.owner}` } });
    expect(downloaded.headers.get("content-disposition")).toContain("attachment");
    expect(downloaded.headers.get("content-disposition")).toContain("guide.pdf");
    for (const token of [s.tokens.other, s.tokens.sales]) {
      expect((await s.t.fetch(`/resources/file?resourceId=${resourceId}`, { headers: { Origin: "http://localhost:5173", Authorization: `Bearer ${token}` } })).status).toBe(403);
    }
    expect((await s.t.fetch(`/resources/file?resourceId=${resourceId}`, { headers: { Origin: "https://evil.example", Authorization: `Bearer ${s.tokens.owner}` } })).status).toBe(403);
    expect((await s.t.fetch(`/resources/file?resourceId=${row.storageId}`, { headers: { Origin: "http://localhost:5173", Authorization: `Bearer ${s.tokens.owner}` } })).status).toBe(403);
  });

  it("deduplicates create, replaces at stable ID, protects stale clients, and cleans old storage", async () => {
    const s = await setup();
    const first = await upload(s.t, s.tokens.owner);
    const { resourceId } = await first.json() as any;
    const original = (await s.t.query(resources.list, { sessionToken: s.tokens.owner, status: "active" }) as any).rows[0];
    const retry = await upload(s.t, s.tokens.owner);
    expect(await retry.json()).toMatchObject({ resourceId, reused: true });
    expect((await s.t.query(resources.list, { sessionToken: s.tokens.owner, status: "active" }) as any).rows).toHaveLength(1);
    const foreignRetry = await upload(s.t, s.tokens.other);
    expect(foreignRetry.status).toBe(200);
    expect((await foreignRetry.json() as any).resourceId).not.toBe(resourceId);
    const replacement = await upload(s.t, s.tokens.docs, jpeg, { requestId: "replace-1234", filename: "new.jpg", type: "image/jpeg", resourceId, expectedStorageId: original.storageId, title: "Updated" });
    expect(replacement.status).toBe(200);
    expect((await replacement.json() as any).resourceId).toBe(resourceId);
    const updated = (await s.t.query(resources.list, { sessionToken: s.tokens.owner, status: "active" }) as any).rows[0];
    expect(updated).toMatchObject({ _id: resourceId, title: "Updated", mimeType: "image/jpeg", originalFileName: "new.jpg", updatedByUserId: s.docsId });
    expect(await s.t.run((ctx) => ctx.db.system.get("_storage", original.storageId))).toBeNull();
    expect((await upload(s.t, s.tokens.owner, pdf, { requestId: "stale-1234", resourceId, expectedStorageId: original.storageId })).status).toBe(409);
    expect((await s.t.query(resources.list, { sessionToken: s.tokens.owner, status: "active" }) as any).rows[0].storageId).toBe(updated.storageId);
  });

  it("archives, restores, and deletes only archived records with their files", async () => {
    const s = await setup();
    const { resourceId } = await (await upload(s.t, s.tokens.owner)).json() as any;
    const row = (await s.t.query(resources.list, { sessionToken: s.tokens.owner, status: "active" }) as any).rows[0];
    await expect(s.t.mutation(mutations.deleteArchived, { sessionToken: s.tokens.owner, resourceId })).rejects.toThrow("Archive");
    await s.t.mutation(mutations.archive, { sessionToken: s.tokens.owner, resourceId });
    expect((await s.t.query(resources.list, { sessionToken: s.tokens.owner, status: "active" }) as any).rows).toHaveLength(0);
    expect((await s.t.query(resources.list, { sessionToken: s.tokens.owner, status: "archived" }) as any).rows).toHaveLength(1);
    expect(await s.t.run((ctx) => ctx.db.system.get("_storage", row.storageId))).not.toBeNull();
    await s.t.mutation(mutations.restore, { sessionToken: s.tokens.docs, resourceId });
    expect((await s.t.query(resources.list, { sessionToken: s.tokens.owner, status: "active" }) as any).rows).toHaveLength(1);
    await s.t.mutation(mutations.archive, { sessionToken: s.tokens.owner, resourceId });
    await s.t.mutation(mutations.deleteArchived, { sessionToken: s.tokens.owner, resourceId });
    expect(await s.t.run((ctx) => ctx.db.system.get("_storage", row.storageId))).toBeNull();
    expect((await s.t.query(resources.list, { sessionToken: s.tokens.owner, status: "archived" }) as any).rows).toHaveLength(0);
  });

  it("does not project company Resources into Client Portal Documents", async () => {
    const s = await setup();
    const clientId = await s.t.run(async (ctx) => {
      const clientId = await ctx.db.insert("clientUsers", {
        email: "resource-client@example.test", passwordHash: await hashPassword(password),
        displayName: "Resource Client", status: "active", createdAt: 1, updatedAt: 1,
      });
      await ctx.db.insert("clientRelationships", {
        companyId: s.companyId, clientUserId: clientId, displayName: "Resource Client",
        clientType: "residential", status: "active", createdAt: 1, updatedAt: 1,
      });
      return clientId;
    });
    const result = await upload(s.t, s.tokens.owner, pdf, { title: "Private company guide" });
    expect(result.status).toBe(200);
    const client = await s.t.action(api.clientAuthActions.signIn, { email: "resource-client@example.test", password });
    const documents = await s.t.query((api as any).queries.clientPortal.getClientDocuments,
      { clientUserId: clientId, sessionToken: client.sessionToken });
    expect(documents).toMatchObject({ proposals: [], agreements: [] });
    expect(JSON.stringify(documents)).not.toContain("Private company guide");
  });
});
