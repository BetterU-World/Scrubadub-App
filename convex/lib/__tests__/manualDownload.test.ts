import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { get } from "@vercel/blob";
import schema from "../../schema";
import { api } from "../../_generated/api";

const modules = import.meta.glob("../../**/*.ts");
const token = "vercel_blob_rw_synthetic_manual_test";
const origin = "https://synthetic.private.blob.vercel-storage.com";
const pdf = Buffer.from("%PDF-1.4\nSynthetic SCRUB security regression fixture\n%%EOF");

async function fixture(role: "owner" | "cleaner" | "maintenance" | "manager" = "owner") {
  const t = convexTest(schema, modules);
  const sessionToken = "synthetic-manual-session";
  const ids = await t.run(async ctx => {
    const companyId = await ctx.db.insert("companies", { name: "Synthetic manuals", timezone: "America/New_York" });
    const userId = await ctx.db.insert("users", { name: "Synthetic staff", email: "manual@example.test", passwordHash: "unused", role, companyId, status: "active" });
    const otherUserId = await ctx.db.insert("users", { name: "Other staff", email: "other@example.test", passwordHash: "unused", role: "owner", companyId, status: "active" });
    const now = Date.now();
    const sessionId = await ctx.db.insert("authSessions", { principalType: "staff", userId, tokenHash: createHash("sha256").update(sessionToken + "test-token-pepper").digest("hex"), version: 1, createdAt: now, lastUsedAt: now, expiresAt: now + 60_000, idleExpiresAt: now + 60_000 });
    const manualId = await ctx.db.insert("manuals", { title: "Synthetic manual", category: "cleaner", roleVisibility: "cleaner", blobKey: `${origin}/manual.pdf`, createdAt: now });
    return { userId, otherUserId, sessionId, manualId };
  });
  return { t, ...ids, args: { userId: ids.userId, sessionToken, manualId: ids.manualId } };
}

describe("manual downloads through the real Blob SDK and Undici", () => {
  const previousDispatcher = getGlobalDispatcher();
  let agent: MockAgent;

  beforeEach(() => {
    vi.stubEnv("TOKEN_PEPPER", "test-token-pepper");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", token);
    vi.stubEnv("APP_URL", "https://synthetic.example.test");
    vi.stubEnv("SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS", "false");
    agent = new MockAgent();
    agent.disableNetConnect();
    setGlobalDispatcher(agent);
  });

  afterEach(async () => {
    setGlobalDispatcher(previousDispatcher);
    await agent.close();
    vi.unstubAllEnvs();
  });

  function reply(status = 200, body: string | Buffer = pdf, contentType = "application/pdf") {
    return agent.get(origin).intercept({ path: "/manual.pdf", method: "GET", headers: { authorization: `Bearer ${token}` } })
      .reply(status, body, { headers: { "content-type": contentType } });
  }

  it.each(["owner", "cleaner", "maintenance", "manager"] as const)("downloads authorized cleaner-visible content for %s and stores exact PDF bytes", async role => {
    const s = await fixture(role);
    reply();
    const result = await s.t.action(api.actions.manuals.getManualSignedUrl, s.args);
    expect(result.url).toBeTruthy();
    const stored = await s.t.run(async ctx => {
      const rows = await ctx.db.system.query("_storage").collect();
      expect(rows).toHaveLength(1);
      const blob = await ctx.storage.get(rows[0]._id);
      return { type: blob!.type, bytes: await blob!.arrayBuffer() };
    });
    expect(stored.type).toBe("application/pdf");
    expect(Buffer.from(stored.bytes)).toEqual(pdf);
    agent.assertNoPendingInterceptors();
  });

  it.each(["cleaner", "maintenance", "manager"] as const)("denies owner-only content to %s before any outbound request", async role => {
    const s = await fixture(role);
    await s.t.run(ctx => ctx.db.patch(s.manualId, { roleVisibility: "owner" }));
    await expect(s.t.action(api.actions.manuals.getManualSignedUrl, s.args)).rejects.toThrow("Access denied");
    expect(await s.t.run(ctx => ctx.db.system.query("_storage").collect())).toHaveLength(0);
  });

  it.each(["missing", "expired", "idle-expired", "revoked", "mismatched", "inactive"])("denies %s session before any outbound request", async kind => {
    const s = await fixture();
    if (kind === "expired") await s.t.run(ctx => ctx.db.patch(s.sessionId, { expiresAt: Date.now() - 1 }));
    if (kind === "idle-expired") await s.t.run(ctx => ctx.db.patch(s.sessionId, { idleExpiresAt: Date.now() - 1 }));
    if (kind === "revoked") await s.t.run(ctx => ctx.db.patch(s.sessionId, { revokedAt: Date.now() }));
    if (kind === "inactive") await s.t.run(ctx => ctx.db.patch(s.userId, { status: "inactive" }));
    const args = { ...s.args, ...(kind === "missing" ? { sessionToken: "" } : {}), ...(kind === "mismatched" ? { userId: s.otherUserId } : {}) };
    await expect(s.t.action(api.actions.manuals.getManualSignedUrl, args)).rejects.toThrow(kind === "mismatched" ? "does not match" : "verified session is required");
    expect(await s.t.run(ctx => ctx.db.system.query("_storage").collect())).toHaveLength(0);
  });

  it("rejects a deleted manual before fetching", async () => {
    const s = await fixture();
    await s.t.run(ctx => ctx.db.delete(s.manualId));
    await expect(s.t.action(api.actions.manuals.getManualSignedUrl, s.args)).rejects.toThrow("Manual not found");
  });

  it.each([403, 404, 500])("handles Blob status %s without storing content", async status => {
    const s = await fixture();
    reply(status, "synthetic failure");
    await expect(s.t.action(api.actions.manuals.getManualSignedUrl, s.args)).rejects.toThrow(status === 404 ? "Blob not found or not accessible" : `Failed to fetch blob: ${status}`);
    expect(await s.t.run(ctx => ctx.db.system.query("_storage").collect())).toHaveLength(0);
    agent.assertNoPendingInterceptors();
  });

  it("requires a Blob token after authorization", async () => {
    const s = await fixture();
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    await expect(s.t.action(api.actions.manuals.getManualSignedUrl, s.args)).rejects.toThrow("BLOB_READ_WRITE_TOKEN");
  });

  it("honors the external-side-effect kill switch", async () => {
    const s = await fixture();
    vi.stubEnv("SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS", "true");
    await expect(s.t.action(api.actions.manuals.getManualSignedUrl, s.args)).rejects.toThrow("disabled in this environment");
  });

  it("normalizes stored Blob URLs to authenticated private pathname requests", async () => {
    const s = await fixture();
    await s.t.run(ctx => ctx.db.patch(s.manualId, { blobKey: "https://old.public.blob.vercel-storage.com/manual.pdf" }));
    reply();
    await expect(s.t.action(api.actions.manuals.getManualSignedUrl, s.args)).resolves.toMatchObject({ url: expect.any(String) });
    agent.assertNoPendingInterceptors();
  });

  it("consumes chunked synthetic content over a real loopback HTTP connection", async () => {
    // Real SDK + real Undici HTTP parsing; only loopback is permitted, never a production Blob store.
    agent.enableNetConnect(/^127\.0\.0\.1:\d+$/);
    let authorization: string | undefined;
    const server = createServer((req, res) => {
      authorization = req.headers.authorization;
      res.writeHead(200, { "content-type": "application/pdf" });
      res.write(pdf.subarray(0, 12));
      setTimeout(() => res.end(pdf.subarray(12)), 5);
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const s = await fixture();
      await s.t.run(ctx => ctx.db.patch(s.manualId, { blobKey: `http://127.0.0.1:${(server.address() as AddressInfo).port}/manual.pdf` }));
      await expect(s.t.action(api.actions.manuals.getManualSignedUrl, s.args)).resolves.toMatchObject({ url: expect.any(String) });
      expect(authorization).toBe(`Bearer ${token}`);
      const bytes = await s.t.run(async ctx => {
        const [row] = await ctx.db.system.query("_storage").collect();
        return (await ctx.storage.get(row._id))!.arrayBuffer();
      });
      expect(Buffer.from(bytes)).toEqual(pdf);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });

  it("surfaces transport failure without storing a partial manual", async () => {
    const s = await fixture();
    agent.get(origin).intercept({ path: "/manual.pdf" }).replyWithError(new Error("synthetic transport failure"));
    await expect(s.t.action(api.actions.manuals.getManualSignedUrl, s.args)).rejects.toThrow();
    expect(await s.t.run(ctx => ctx.db.system.query("_storage").collect())).toHaveLength(0);
  });

  it("retains SDK content-type metadata for consumers", async () => {
    reply();
    const result = await get("manual.pdf", { access: "private", token });
    expect(result?.statusCode).toBe(200);
    expect(result?.blob.contentType).toBe("application/pdf");
    expect(Buffer.from(await new Response(result!.stream).arrayBuffer())).toEqual(pdf);
  });
});
