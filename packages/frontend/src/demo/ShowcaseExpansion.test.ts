import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement("a", { href, ...props }, children) }));

import { DemoOwnerDetailPage, DemoOwnerOperationsPage } from "../pages/demo/DemoOwnerOperationsPages";
import { DemoWorkerOperationsPage } from "../pages/demo/DemoWorkerOperationsPages";
import { showcaseClients, showcaseOwnerRequests, showcaseProperties, showcaseSchedule } from "./fixtures/operationsShowcaseFixtures";
import { showcaseProperty, showcaseRequests } from "./fixtures/clientShowcaseFixtures";

describe("Showcase Expansion V1", () => {
  it("renders the high-value Owner destinations with Showcase-only links", () => {
    const pages = ["/properties", "/employees", "/calendar", "/requests", "/clients", "/commercial-accounts", "/commercial-invoices", "/financials", "/analytics", "/settings"];
    for (const page of pages) {
      const html = renderToStaticMarkup(createElement(DemoOwnerOperationsPage, { page, presentation: true, currentPath: `/internal/demo/owner${page}` }));
      expect(html).toMatch(/Properties|Team|Calendar|Leads|Clients|Commercial Accounts|Financial overview|Analytics|Workspace settings/);
      expect([...html.matchAll(/href="([^"]+)"/g)].every((match) => match[1].startsWith("/internal/demo/owner"))).toBe(true);
      expect(html).not.toMatch(/<form|type="submit"|convex/);
    }
  });

  it("supports connected Owner detail journeys and isolated not-found states", () => {
    const property = renderToStaticMarkup(createElement(DemoOwnerDetailPage, { kind: "property", id: "linden", presentation: true, currentPath: "/internal/demo/owner/properties/linden" }));
    const client = renderToStaticMarkup(createElement(DemoOwnerDetailPage, { kind: "client", id: "sarah-johnson", presentation: true, currentPath: "/internal/demo/owner/clients/sarah-johnson" }));
    const missing = renderToStaticMarkup(createElement(DemoOwnerDetailPage, { kind: "property", id: "missing", presentation: true, currentPath: "/internal/demo/owner/properties/missing" }));
    expect(property).toContain("Linden House");
    expect(property).toContain("Open job schedule");
    expect(client).toContain("Open primary location");
    expect(client).toContain("Open request");
    expect(missing).toContain("Showcase record not found");
  });

  it("renders all expanded Worker destinations without production links or writes", () => {
    for (const page of ["/calendar", "/availability", "/payments", "/settings"]) {
      const html = renderToStaticMarkup(createElement(DemoWorkerOperationsPage, { page, presentation: true, currentPath: `/internal/demo/worker${page}` }));
      expect(html).toContain("BrightSide Cleaning Co.");
      expect([...html.matchAll(/href="([^"]+)"/g)].every((match) => match[1].startsWith("/internal/demo/worker"))).toBe(true);
      expect(html).not.toMatch(/<form|type="submit"/);
    }
  });

  it("keeps the same clients, properties, requests, and jobs connected across personas", () => {
    expect(showcaseProperties.find((item) => item.id === "linden")?.name).toBe(showcaseProperty.name);
    expect(showcaseClients.find((item) => item.id === "sarah-johnson")?.requestId).toBe(showcaseRequests.find((item) => item.status === "scheduled")?._id);
    expect(showcaseOwnerRequests.find((item) => item.status === "scheduled")?.scheduledJobId).toBe(showcaseRequests.find((item) => item.status === "scheduled")?.scheduledService?._id);
    expect(showcaseSchedule[0].propertyName).toBe(showcaseProperties[0].name);
  });

  it("preserves presentation mode and responsive shell width contracts", () => {
    const presentation = renderToStaticMarkup(createElement(DemoOwnerOperationsPage, { page: "/properties", presentation: true, currentPath: "/internal/demo/owner/properties" }));
    const shell = renderToStaticMarkup(createElement(DemoOwnerOperationsPage, { page: "/properties", presentation: false, currentPath: "/internal/demo/owner/properties" }));
    expect(presentation).not.toContain("Fictional workspace");
    expect(shell).toContain("w-full min-w-0 max-w-full");
    expect(shell).toContain("max-w-full truncate");
  });

  it("mirrors production list, filter, table, and calendar compositions", () => {
    const source = readFileSync(resolve(process.cwd(), "packages/frontend/src/pages/demo/DemoOwnerOperationsPages.tsx"), "utf8");
    expect(source).toContain("Select all");
    expect(source).toContain("Search clients");
    expect(source).toContain("Track prospect requests separately");
    expect(source).toContain('setView(mode)');
    expect(source).toContain('grid grid-cols-7');
    expect(source).toContain('block w-full sm:table');
    expect(source).toContain("Workers & Access");
  });

  it("keeps all fidelity interactions local and production-data isolated", () => {
    const sources = ["packages/frontend/src/pages/demo/DemoOwnerOperationsPages.tsx", "packages/frontend/src/pages/demo/DemoWorkerOperationsPages.tsx"]
      .map(path => readFileSync(resolve(process.cwd(), path), "utf8")).join("\n");
    expect(sources).toContain("useState");
    expect(sources).not.toMatch(/convex\/react|useQuery|useMutation|useAction|api\.mutations/);
  });
});
