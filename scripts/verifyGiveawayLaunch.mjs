// Local UI verification only. Mutation transport is captured; backend/data tests use convex-test.
import { createServer } from "vite";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const repo = process.cwd();
const chrome = process.env.SCRUB_QA_CHROME;
if (!chrome) throw new Error("Set SCRUB_QA_CHROME to an installed headless Chromium executable");
const artifacts = process.env.SCRUB_QA_ARTIFACT_DIR ?? await mkdtemp(path.join(os.tmpdir(), "scrub-giveaway-launch-"));
await mkdir(artifacts, { recursive: true });
const root = path.join(repo, "packages/frontend");
process.chdir(root); // Tailwind content globs are relative to the frontend package.
const server = await createServer({ configFile: path.join(root, "vite.config.ts"), root,
  optimizeDeps: { entries: [path.join(repo, "scripts/fixtures/giveaway-launch/entry.tsx")] },
  resolve: { alias: { "convex/react": path.join(repo, "scripts/fixtures/giveaway-launch/convex.ts") } },
  plugins: [{ name: "isolated-giveaway-qa", configureServer(dev) {
    dev.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith("/giveaway")) return next();
      const entry = `/@fs/${path.join(repo, "scripts/fixtures/giveaway-launch/entry.tsx").replaceAll("\\", "/")}`;
      const html = await dev.transformIndexHtml("/giveaway", `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>`);
      res.setHeader("Content-Type", "text/html"); res.end(html);
    });
  } }],
  server: { host: "127.0.0.1", port: 0, fs: { allow: [repo, path.resolve(repo, "../../node_modules")] } },
});
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const profile = await mkdtemp(path.join(os.tmpdir(), "scrub-giveaway-chromium-"));
const child = spawn(chrome, ["--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "about:blank"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
const endpoint = await new Promise((resolve, reject) => {
  let output = ""; const timeout = setTimeout(() => reject(new Error("Chromium startup timed out")), 20000);
  child.stderr.on("data", chunk => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
  child.on("error", reject);
});
const port = new URL(endpoint).port;
const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item => item.type === "page");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let serial = 0; const pending = new Map(); const failures = []; const blocked = [];
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++serial; const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
  pending.set(id, { resolve: value => { clearTimeout(timeout); resolve(value); }, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
socket.addEventListener("message", async event => {
  const message = JSON.parse(String(event.data));
  if (message.id) { const task = pending.get(message.id); if (task) { pending.delete(message.id); message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result); } }
  if (message.method === "Runtime.exceptionThrown") failures.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  if (message.method === "Fetch.requestPaused") {
    const { requestId, request } = message.params;
    if (request.url.startsWith(origin) || request.url.startsWith("data:")) await send("Fetch.continueRequest", { requestId });
    else { blocked.push(request.url); await send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }); }
  }
});
const evaluate = async expression => {
  const value = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (value.exceptionDetails) throw new Error(value.exceptionDetails.text);
  return value.result.value;
};
const wait = async expression => {
  for (let attempt = 0; attempt < 100; attempt++) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error(`Page condition failed: ${expression}; browser: ${JSON.stringify(failures)}; body: ${await evaluate("document.body.innerText.slice(0, 600)")}`);
};
const results = [];
try {
  await send("Page.enable"); await send("Runtime.enable"); await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `const q = new URLSearchParams(location.search); localStorage.setItem("scrub_language", q.get("lang") || "en"); const frozen = Date.parse(q.get("when") === "before" ? "2026-11-12T08:59:59.999-05:00" : "2026-11-12T09:00:00-05:00"); const RealDate = Date; window.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [frozen])); } static now() { return frozen; } };` });
  for (const width of [320, 390, 1280]) for (const language of ["en", "es"]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
    await send("Page.navigate", { url: `${origin}/giveaway?when=before&lang=${language}` });
    await wait('Boolean(document.querySelector("#giveaway-title"))');
    if (await evaluate('Boolean(document.querySelector("#alternate-email"))')) throw new Error("Alternate form visible before approved opening");
    await send("Page.navigate", { url: `${origin}/giveaway?when=open&lang=${language}` });
    await wait('Boolean(document.querySelector("#alternate-email"))');
    const facts = await evaluate('({ headline: document.querySelector("#giveaway-title").textContent, overflow: document.documentElement.scrollWidth > innerWidth, styled: getComputedStyle(document.querySelector("#giveaway-title")).fontSize === "36px" || getComputedStyle(document.querySelector("#giveaway-title")).fontSize === "48px", boxes: Array.from(document.querySelectorAll("#alternate-entry input[type=checkbox]")).map(x => ({required:x.required, checked:x.checked})), fields: Array.from(document.querySelectorAll("#alternate-entry input")).map(x => x.type), spanish: document.querySelector("#alternate-entry").lang })');
    if (!facts.headline.includes("$50") || !facts.styled || facts.overflow || facts.boxes.length !== 3 || facts.boxes[2].required || facts.boxes.some(x => x.checked)) throw new Error(`Layout/consent failure: ${JSON.stringify(facts)}`);
    if (language === "es" && facts.spanish !== "es") throw new Error("Spanish entry presentation missing");
    if (facts.fields.some(field => !["text", "email", "checkbox"].includes(field))) throw new Error("Unexpected payment or account field");
    await evaluate('document.querySelector("#alternate-entry").scrollIntoView()');
    const screenshot = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(path.join(artifacts, `giveaway-${width}-${language}.png`), Buffer.from(screenshot.data, "base64"));
    await evaluate(`(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; for (const [id,value] of [["alternate-first-name","Synthetic"],["alternate-last-name","Entrant"],["alternate-email","synthetic@example.test"]]) { const input=document.getElementById(id);set.call(input,value);input.dispatchEvent(new Event("input",{bubbles:true})); } const boxes=document.querySelectorAll("#alternate-entry input[type=checkbox]");boxes[0].click();boxes[1].click(); })()`);
    await evaluate('document.querySelector("#alternate-entry form").requestSubmit()');
    await wait('Boolean(window.__giveawaySubmissions?.length)');
    const payload = await evaluate('window.__giveawaySubmissions[0]');
    if (payload.campaignId !== "scrub-giveaway-2026-002" || payload.marketingConsent !== false || !payload.rulesVersion.endsWith("rules-v1")) throw new Error("Incorrect synthetic submission payload");
    results.push({ width, language, ...facts, syntheticReceipt: true });
  }
  if (failures.length) throw new Error(`Browser errors: ${failures.join(", ")}`);
  await writeFile(path.join(artifacts, "results.json"), JSON.stringify({ transport: "local mock; no production entries", results, blockedExternalRequests: blocked.length, runtimeErrors: failures }, null, 2));
  console.log(JSON.stringify({ passed: results.length, artifacts, productionRequests: 0 }));
} finally {
  try { await send("Browser.close"); } catch {}
  socket.close(); if (child.exitCode === null) child.kill(); await server.close();
}
