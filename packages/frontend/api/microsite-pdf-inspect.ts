import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { Sandbox } from "@vercel/sandbox";
import { PDF_INSPECTOR, PDF_LIMITS, PDF_POLICY } from "../../../convex/lib/micrositeResourcesModel.js";
import { pdfPublicationPolicy } from "./_pdfPublicationPolicy.js";

const requestId = /^[a-z0-9]{20,64}$/;
const nonceId = /^[0-9a-f-]{36}$/;

function hasWorkerKey(value: string | undefined, key: string) {
  const actual = Buffer.from(value ?? "");
  const expected = Buffer.from(`Bearer ${key}`);
  return key.length >= 32 && actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function boundedBytes(response: Response) {
  const length = Number(response.headers.get("Content-Length"));
  if (!response.ok || response.headers.get("Content-Type") !== "application/pdf" ||
    !Number.isSafeInteger(length) || length < 1 || length > PDF_LIMITS.bytes || !response.body) throw new Error("File unavailable");
  const output = Buffer.alloc(length);
  const reader = response.body.getReader();
  let offset = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (offset + value.length > length) throw new Error("File length changed");
      output.set(value, offset);
      offset += value.length;
    }
  } finally {
    if (offset !== length) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  if (offset !== length) throw new Error("File length changed");
  return output;
}

export default async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  const key = process.env.MICROSITE_PDF_WORKER_KEY ?? "";
  if (req.method !== "POST" || !hasWorkerKey(req.headers.authorization, key)) {
    res.statusCode = 404;
    res.end();
    return;
  }
  let sandbox: Awaited<ReturnType<typeof Sandbox.create>> | undefined;
  let status = "unavailable";
  try {
    if (Number(req.headers["content-length"]) > 1024) throw new Error("Invalid job");
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== "object" || !("jobId" in body) || typeof body.jobId !== "string" || !requestId.test(body.jobId) ||
      !("nonce" in body) || typeof body.nonce !== "string" || !nonceId.test(body.nonce)) throw new Error("Invalid job");
    const snapshotId = process.env.MICROSITE_PDF_SNAPSHOT_ID ?? "";
    const site = new URL(process.env.MICROSITE_PDF_CONVEX_ORIGIN ?? "");
    if (!/^snap_[A-Za-z0-9]+$/.test(snapshotId) || site.protocol !== "https:" || site.pathname !== "/" ||
      site.username || site.password || site.search || site.hash) throw new Error("Worker unavailable");
    // Claim the authorized generation before launching any metered sandbox.
    const file = await fetch(new URL("/internal/microsite-pdf", site), {
      headers: { Authorization: `Bearer ${key}`, "X-Inspection-Job": body.jobId, "X-Inspection-Nonce": body.nonce },
      redirect: "error", signal: AbortSignal.timeout(8_000),
    });
    const input = await boundedBytes(file);
    sandbox = await Sandbox.create({
      source: { type: "snapshot", snapshotId }, resources: { vcpus: 1 }, timeout: 35_000,
      networkPolicy: "deny-all", persistent: false, ports: [], mounts: {}, env: {},
    });
    if (sandbox.networkPolicy !== "deny-all" || sandbox.persistent) throw new Error("Sandbox configuration changed");
    const version = await sandbox.runCommand({ cmd: "/vercel/pdf-deps/bin/qpdf", args: ["--version"] });
    if (version.exitCode !== 0 || !(await version.stdout()).startsWith("qpdf version 12.4.2\n")) throw new Error("Inspector version unavailable");
    await sandbox.writeFiles([{ path: "/vercel/input.pdf", content: input }]);
    const command = await sandbox.runCommand({
      cmd: "timeout",
      args: ["--kill-after=1s", "12s", "prlimit", "--as=402653184", "--core=0", "--", "python3", "-c", pdfPublicationPolicy],
    });
    if (command.exitCode === 0) {
      const result = (await command.stdout()).trim();
      if (result === "passed" || result === "rejected") status = result;
    }
  } catch { /* Fail closed and avoid emitting guest or document diagnostics. */ }
  finally {
    if (sandbox) await sandbox.stop().catch(() => {});
  }
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ policy: PDF_POLICY, inspector: PDF_INSPECTOR, status }));
}
