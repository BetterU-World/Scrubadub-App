import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { expect, it } from "vitest";
import postcss from "postcss";
import autoprefixer from "autoprefixer";

const require = createRequire(import.meta.url);

it("preserves explicit browser targeting, prefix generation and CSS source-map round trips", async () => {
  const browserslist = require("browserslist");
  expect(browserslist("Safari 12")).toEqual(["safari 12"]);
  const result = await postcss([autoprefixer({ overrideBrowserslist: ["Safari 12"] })]).process(".card { display: flex; user-select: none; }", { from: "synthetic.css", to: "synthetic.out.css", map: { inline: false, annotation: false } });
  expect(result.css).toContain("-webkit-user-select: none");
  expect(result.css).toContain("display: flex");
  const { SourceMapConsumer } = require("source-map-js");
  const consumer = new SourceMapConsumer(result.map!.toJSON());
  expect(consumer.originalPositionFor({ line: 1, column: 0 })).toMatchObject({ source: "synthetic.css", line: 1 });
});

it.each([require, createRequire(require.resolve("vite/package.json"))])("matches trusted content globs and rejects prototype method character classes", resolver => {
  const picomatch = resolver("picomatch");
  expect(picomatch("src/**/*.{ts,tsx}")("src/pages/Card.tsx")).toBe(true);
  expect(picomatch("src/**/*.{ts,tsx}")("node_modules/private.ts")).toBe(false);
  expect(picomatch("[[:alpha:]]")("t")).toBe(true);
  expect(picomatch("[[:toString:]]")("t")).toBe(false);
});

it("terminates Nanoid zero-size custom generators and rejects invalid allocation sizes in a bounded subprocess", () => {
  const script = `const assert = require('node:assert/strict'); const {customAlphabet,nanoid}=require(${JSON.stringify(require.resolve("nanoid"))}); assert.equal(customAlphabet('abc',0)(),''); assert.equal(customAlphabet('abc',12)().length,12); assert.throws(()=>nanoid(-1),RangeError); console.log('bounded');`;
  expect(execFileSync(process.execPath, ["-e", script], { encoding: "utf8", timeout: 5_000 }).trim()).toBe("bounded");
}, 10_000);
