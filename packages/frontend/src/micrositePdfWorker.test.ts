import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const sandbox = vi.hoisted(() => ({
  create: vi.fn(), stop: vi.fn(), runCommand: vi.fn(), writeFiles: vi.fn(),
}));
vi.mock("@vercel/sandbox", () => ({ Sandbox: { create: sandbox.create } }));
import handler from "../api/microsite-pdf-inspect";

const secret = "local-only-inspection-worker-key-123";
const jobId = "j".repeat(32);
const nonce = "e221713b-2ca6-441c-8b69-d35f66570c74";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("MICROSITE_PDF_WORKER_KEY", secret);
  vi.stubEnv("MICROSITE_PDF_CONVEX_ORIGIN", "https://fixture.convex.site");
  vi.stubEnv("MICROSITE_PDF_SNAPSHOT_ID", "snap_fixture");
  sandbox.create.mockResolvedValue({ ...sandbox, networkPolicy: "deny-all", persistent: false });
  sandbox.stop.mockResolvedValue(undefined);
  sandbox.runCommand.mockResolvedValueOnce({ exitCode: 0, stdout: async () => "qpdf version 12.4.2\n" });
  sandbox.runCommand.mockResolvedValue({ exitCode: 0, stdout: async () => "passed\n" });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function call(authorization = `Bearer ${secret}`) {
  const request = { method: "POST", headers: { authorization, "content-length": "128" }, body: { jobId, nonce } };
  const response = { statusCode: 200, value: "", setHeader: vi.fn(), end(value = "") { this.value = value; } };
  await handler(request as unknown as IncomingMessage, response as unknown as ServerResponse);
  return response;
}

it("fails closed before paid execution when the worker credential or one-time claim is invalid", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
  vi.stubGlobal("fetch", fetch);
  expect((await call("Bearer wrong")).statusCode).toBe(404);
  expect(fetch).not.toHaveBeenCalled();
  expect(JSON.parse((await call()).value).status).toBe("unavailable");
  expect(sandbox.create).not.toHaveBeenCalled();
});

it("transfers one exact file only after the disposable deny-all sandbox is confirmed and stops on all outcomes", async () => {
  const data = Buffer.from("%PDF-1.4 synthetic fixture");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(data, {
    headers: { "Content-Type": "application/pdf", "Content-Length": String(data.length) },
  })));
  const result = await call();
  expect(JSON.parse(result.value)).toEqual({ policy: "static-pdf-v1", inspector: "qpdf-12.4.2", status: "passed" });
  expect(sandbox.create).toHaveBeenCalledWith({
    source: { type: "snapshot", snapshotId: "snap_fixture" }, resources: { vcpus: 1 },
    timeout: 35000, networkPolicy: "deny-all", persistent: false, ports: [], mounts: {}, env: {},
  });
  expect(sandbox.writeFiles).toHaveBeenCalledWith([{ path: "/vercel/input.pdf", content: data }]);
  expect(sandbox.stop).toHaveBeenCalledOnce();
  sandbox.create.mockResolvedValueOnce({ ...sandbox, networkPolicy: "allow-all", persistent: false });
  expect(JSON.parse((await call()).value).status).toBe("unavailable");
  expect(sandbox.writeFiles).toHaveBeenCalledOnce();
  expect(sandbox.stop).toHaveBeenCalledTimes(2);
});
