// Run with Node 24 after npm ci. Pass the path to an installed @vercel/node package.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const builderPath = process.argv[2];
assert.ok(builderPath, "Pass the path to an installed @vercel/node package directory.");
const require = createRequire(import.meta.url);
const builder = require(path.resolve(builderPath));
const { FileBlob } = createRequire(require.resolve(path.resolve(builderPath)))("@vercel/build-utils");
const repoRootPath = fileURLToPath(new URL("../", import.meta.url));
const workPath = path.join(repoRootPath, "packages/frontend");
const entrypoint = "api/microsite-pdf-inspect.ts";
const { output } = await builder.build({
  files: { [entrypoint]: new FileBlob({ data: await readFile(path.join(workPath, entrypoint)) }) },
  entrypoint,
  workPath,
  repoRootPath,
  config: {
    projectSettings: { nodeVersion: "24.x" },
    functions: { [entrypoint]: { installCommand: "" } },
  },
});

const tracedFiles = Object.keys(output.files).map(name => name.split(path.sep).join("/"));
assert.ok(tracedFiles.includes("packages/frontend/src/lib/micrositePdfContract.js"),
  "The shared inspection contract must be emitted inside the Function's ESM workspace.");
assert.ok(!tracedFiles.some(name => name.startsWith("convex/") || name.includes("/node_modules/convex/") ||
  name.startsWith("node_modules/convex/")), "The PDF Function must not trace Convex backend code.");

const bundle = await mkdtemp(path.join(tmpdir(), "scrub-pdf-function-"));
try {
  // Materialize the traced Function on its own so imports cannot fall back to the checkout.
  for (const [name, file] of Object.entries(output.files)) {
    const destination = path.join(bundle, name);
    await mkdir(path.dirname(destination), { recursive: true });
    await pipeline(file.toStream(), createWriteStream(destination));
  }
  const handlerUrl = pathToFileURL(path.join(bundle, output.handler)).href;
  // Vercel disables require(esm) by default; the worker deployment opts in for the pinned SDK.
  const invocation = spawnSync(process.execPath, ["--experimental-require-module", "--input-type=module", "-e", `
    import assert from "node:assert/strict";
    const { default: handler } = await import(process.argv[1]);
    process.env.MICROSITE_PDF_WORKER_KEY = "test-key-for-bundled-function-authentication";
    globalThis.fetch = () => assert.fail("Unauthenticated requests must not transfer a file");
    for (const headers of [{}, { authorization: "Bearer invalid" }]) {
      const responseHeaders = new Map();
      const response = {
        setHeader: (key, value) => responseHeaders.set(key, value),
        end: (body) => assert.equal(body, undefined),
      };
      await handler({ method: "POST", headers, body: {} }, response);
      assert.equal(response.statusCode, 404);
      assert.equal(responseHeaders.get("Cache-Control"), "no-store");
      assert.equal(responseHeaders.get("X-Robots-Tag"), "noindex");
    }
  `, handlerUrl], { encoding: "utf8" });
  assert.ifError(invocation.error);
  assert.equal(invocation.status, 0, invocation.stderr);
  console.log("Packaged PDF Function loaded and rejected missing and invalid worker authorization.");
} finally {
  await rm(bundle, { force: true, recursive: true });
}
