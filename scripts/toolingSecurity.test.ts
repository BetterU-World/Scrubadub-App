import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import concurrently from "concurrently";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const shellQuote = require("shell-quote") as {
  quote(tokens: (string | { op: string } | { comment: string })[]): string;
  parse(command: string): unknown[];
};
const fixture = fileURLToPath(new URL("./fixtures/launcher-child.cjs", import.meta.url));
const command = (args: string) => `"${process.execPath}" "${fixture}" ${args}`;

function captureOutput() {
  let output = "";
  const stream = new Writable({ write(chunk, _encoding, done) { output += chunk.toString(); done(); } });
  return { stream, read: () => output };
}

describe("development/test launcher dependency integration", () => {
  it.each(["\n", "\r", "\u2028", "\u2029"])("rejects unsafe object/comment tokens containing line separator %j without executing them", separator => {
    expect(() => shellQuote.quote([{ op: `;${separator}SCRUB_SENTINEL` }])).toThrow(TypeError);
    expect(() => shellQuote.quote(["echo", { comment: "synthetic" }, `a${separator}SCRUB_SENTINEL`])).toThrow(TypeError);
  });

  it("preserves string arguments containing spaces and shell punctuation", () => {
    const args = ["plain", "two words", "literal;punctuation", "$literal", "apostrophe's", ""];
    // Parse round trip only; no potentially unsafe string is passed to an OS shell.
    expect(shellQuote.parse(shellQuote.quote(args))).toEqual(args);
  });

  it("parses a large argument list within a bounded subprocess lifetime", () => {
    const count = execFileSync(process.execPath, [fixture, "parse"], { encoding: "utf8", timeout: 5_000 });
    expect(count.trim()).toBe("128000");
  }, 10_000);

  it("runs two benign commands, preserves quoted arguments and additional argument expansion", async () => {
    const output = captureOutput();
    const run = concurrently([
      { name: "backend-fixture", command: command('"two words" {1}') },
      { name: "frontend-fixture", command: command("frontend") },
    ], { outputStream: output.stream, additionalArguments: ["placeholder"] });
    try {
      const events = await run.result;
      expect(events).toHaveLength(2);
      expect(events.every(event => event.exitCode === 0)).toBe(true);
      expect(output.read()).toContain('["two words","placeholder"]');
      expect(output.read()).toContain('["frontend"]');
    } finally {
      for (const child of run.commands) if (!child.exited) child.kill();
    }
  }, 15_000);

  it("propagates a nonzero child exit as launcher failure", async () => {
    const output = captureOutput();
    const run = concurrently([{ name: "failure", command: command("fail") }], { outputStream: output.stream });
    await expect(run.result).rejects.toEqual([expect.objectContaining({ exitCode: 7 })]);
  }, 15_000);

  it("terminates a sibling process when configured to stop on failure", async () => {
    const output = captureOutput();
    const run = concurrently([
      { name: "waiting", command: command("hold") },
      { name: "failure", command: command("fail") },
    ], { outputStream: output.stream, killOthers: ["failure"] });
    try {
      const events = await run.result.then(() => { throw new Error("Expected launcher failure"); }, events => events);
      expect(events).toEqual(expect.arrayContaining([
        expect.objectContaining({ command: expect.objectContaining({ name: "waiting" }), killed: true }),
        expect.objectContaining({ command: expect.objectContaining({ name: "failure" }), exitCode: 7 }),
      ]));
    } finally {
      for (const child of run.commands) if (!child.exited) child.kill();
    }
  }, 15_000);
});
