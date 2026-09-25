import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resourceSiteUrl } from "./resourceModel";

describe("deployed Resource retrieval policy", () => {
  it("permits the generated Convex HTTP-action host in connect-src", () => {
    const config = JSON.parse(readFileSync(new URL("../../../vercel.json", import.meta.url), "utf8"));
    const csp: string = config.headers[0].headers.find((header: { key: string }) => header.key === "Content-Security-Policy").value;
    const sources = csp.split(";").map((directive) => directive.trim()).find((directive) => directive.startsWith("connect-src "))!.split(/\s+/).slice(1);
    const resourceHost = new URL(resourceSiteUrl("https://resource-deployment.convex.cloud")).hostname;
    expect(sources.some((source) => source === `https://${resourceHost}` || source === "https://*.convex.site")).toBe(true);
    expect(sources).not.toContain("*");
  });
});
