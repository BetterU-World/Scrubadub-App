import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ShowcaseEntryPage } from "../pages/demo/ShowcaseEntryPage";
import { DemoClientRequestNewPage } from "../pages/demo/DemoClientRequestNewPage";
import { DemoClientPage } from "../pages/demo/DemoClientPage";
import {
  DemoOwnerDetailPage,
  DemoOwnerOperationsPage,
} from "../pages/demo/DemoOwnerOperationsPages";
import { getShowcaseWorker } from "./fixtures/operationsShowcaseFixtures";

const root = resolve(__dirname, "../../../..");
(globalThis as any).location = { pathname: "/", search: "", hash: "" };
describe("Showcase Public Launch V1", () => {
  it("renders the public persona entrance and transparency copy", () => {
    const html = renderToStaticMarkup(createElement(ShowcaseEntryPage));
    expect(html).toContain("Choose how you want to experience SCRUB");
    expect(html).toContain("/internal/demo/owner");
    expect(html).toContain("/internal/demo/worker");
    expect(html).toContain("/internal/demo/client");
    expect(html).toContain("fictional, representative workspace");
  });
  it("renders a local-only production-shaped client request form", () => {
    const html = renderToStaticMarkup(
      createElement(DemoClientRequestNewPage, {
        presentation: true,
        currentPath: "/internal/demo/client/requests/new",
      }),
    );
    expect(html).toContain("Request Service");
    expect(html).toContain("Linden House");
    expect(html).toContain("Review request");
    const source = readFileSync(
      resolve(
        root,
        "packages/frontend/src/pages/demo/DemoClientRequestNewPage.tsx",
      ),
      "utf8",
    );
    expect(source).toContain("setNotice(true)");
    expect(source).not.toContain("useMutation");
    expect(source).not.toContain("api.");
  });
  it("wires Request Service and Pay Online to Showcase-safe behavior", () => {
    const requests = renderToStaticMarkup(
      createElement(DemoClientPage, {
        page: "/requests",
        presentation: true,
        currentPath: "/internal/demo/client/requests",
      }),
    );
    expect(requests).toContain("Request Service");
    expect(requests).toContain("/requests/new");
    const source = readFileSync(
      resolve(root, "packages/frontend/src/pages/demo/DemoClientPage.tsx"),
      "utf8",
    );
    expect(source).toContain("onPay={() => setNotice(true)}");
    expect(source).not.toContain("stripe");
  });
  it("represents the current non-financial Operations Manager profile", () => {
    const manager = getShowcaseWorker("olivia") as any;
    expect(manager.role).toBe("Operations Manager");
    expect(manager.permissions.flatMap((x: any) => x[1])).toContain(
      "Manage schedules and Job Requests",
    );
    expect(manager.permissions.flatMap((x: any) => x[1])).not.toContain(
      "View financials",
    );
    const list = renderToStaticMarkup(
      createElement(DemoOwnerOperationsPage, {
        page: "/employees",
        presentation: true,
        currentPath: "/internal/demo/owner/employees",
      }),
    );
    const detail = renderToStaticMarkup(
      createElement(DemoOwnerDetailPage, {
        kind: "employee",
        id: "olivia",
        presentation: true,
        currentPath: "/internal/demo/owner/employees/olivia",
      }),
    );
    expect(list).toContain("Olivia Grant");
    expect(detail).toContain("Manager permissions");
    expect(detail).toContain("Owner authority remains separate");
  });
  it("keeps the signup CTA and adds one landing Showcase CTA", () => {
    const source = readFileSync(
      resolve(root, "packages/frontend/src/pages/auth/LandingPage.tsx"),
      "utf8",
    );
    expect(source).toContain("Start 14 days free");
    expect(source).toMatch(/<a\s+href="\/showcase"/);
    expect(source).not.toMatch(/<Link\s+href="\/showcase"/);
    expect(source.match(/Explore SCRUB Showcase/g)).toHaveLength(1);
  });
});
