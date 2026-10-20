import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "vite";
import { rollup } from "rollup";
import { expect, it } from "vitest";

async function fixture(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "scrub-build-security-"));
  try { await run(dir); }
  finally {
    // Cleanup is restricted to the synthetic directory created by this test.
    if (path.dirname(dir) !== path.resolve(os.tmpdir()) || !path.basename(dir).startsWith("scrub-build-security-")) throw new Error("Unexpected fixture directory");
    await rm(dir, { recursive: true, force: true });
  }
}

it("serves and transforms a local module while denying synthetic private files", async () => {
  await fixture(async dir => {
    await writeFile(path.join(dir, "entry.js"), "export const value = 'synthetic'; if (import.meta.hot) import.meta.hot.accept();");
    await writeFile(path.join(dir, ".env.synthetic"), "SCRUB_SENTINEL=private-fixture");
    const server = await createServer({ configFile: false, root: dir, logLevel: "silent", server: { host: "127.0.0.1", port: 0, fs: { strict: true, allow: [dir] } } });
    try {
      await server.listen();
      const address = server.httpServer!.address();
      if (!address || typeof address === "string") throw new Error("Expected loopback server");
      const base = `http://127.0.0.1:${address.port}`;
      const entry = await fetch(`${base}/entry.js`);
      expect(entry.status).toBe(200);
      expect(await entry.text()).toContain("import.meta.hot");
      for (const suffix of ["", "?raw", "?url"]) {
        const denied = await fetch(`${base}/.env.synthetic${suffix}`);
        expect(denied.status).toBe(403);
        expect(await denied.text()).not.toContain("private-fixture");
      }
    } finally { await server.close(); }
  });
}, 15_000);

it("builds a named entry but rejects a traversal name before writing outside the output directory", async () => {
  await fixture(async dir => {
    const entry = path.join(dir, "entry.js");
    const out = path.join(dir, "dist");
    await mkdir(out);
    await writeFile(entry, "export const value = 'synthetic';");
    const safe = await rollup({ input: { app: entry } });
    try { await safe.write({ dir: out, format: "es" }); }
    finally { await safe.close(); }
    expect(await readFile(path.join(out, "app.js"), "utf8")).toContain("synthetic");
    const unsafe = await rollup({ input: { "../escape": entry } });
    try { await expect(unsafe.write({ dir: out, format: "es" })).rejects.toThrow(); }
    finally { await unsafe.close(); }
    await expect(readFile(path.join(dir, "escape.js"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
