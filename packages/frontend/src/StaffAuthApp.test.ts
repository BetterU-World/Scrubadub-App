// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "./i18n/en/common.json";
import es from "./i18n/es/common.json";

let failure: Error | null;
let role: "owner" | "manager" | "cleaner" | "maintenance" = "owner";
let language: "en" | "es" = "en";
const calls: string[] = [];
vi.mock("convex/react", () => ({
  useQuery: (reference: any, args: any) => {
    if (args === "skip") return undefined;
    const name = getFunctionName(reference); calls.push(name);
    if (name === "authQueries:getCurrentUser") return { _id: "staff", companyId: "company", role, status: "active", isSuperadmin: false };
    if (name === "queries/manuals:getVisibleManuals") return [];
    if (name === "queries/billing:getCompanySubscription") {
      if (failure) throw failure;
      return { subscriptionStatus: "active" };
    }
    throw Error(`Unexpected query ${name}`);
  },
  useAction: () => vi.fn(), useMutation: () => vi.fn(), usePaginatedQuery: () => ({}), useConvex: () => ({}),
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({
  t: (key: string) => key.split(".").reduce<any>((value, part) => value?.[part], language === "es" ? es : en) ?? key,
  i18n: { language },
}) }));
vi.mock("@sentry/react", () => ({ captureException: vi.fn() }));
vi.mock("@vercel/analytics/react", () => ({ Analytics: () => null }));
vi.mock("@/components/layout/AppLayout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/shared/OfflineIndicator", () => ({ OfflineIndicator: () => null }));
vi.mock("@/pages/auth/LoginPage", () => ({ LoginPage: () => createElement("form", { "data-testid": "staff-sign-in" }, "Sign In") }));
vi.mock("@/pages/auth/LandingPage", () => ({ LandingPage: () => createElement("p", null, "Public landing") }));
vi.mock("@/pages/owner/DashboardPage", () => ({ DashboardPage: () => createElement("p", { "data-testid": "workspace" }, "Workspace") }));

import App from "./App";
import { StaffSessionRecovery } from "./components/shared/StaffSessionRecovery";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";
import { getStaffSessionToken, setStaffSessionToken } from "./lib/staffSession";
import { isStaffSessionError } from "./lib/staffSessionError";

let root: Root;
let host: HTMLDivElement;
function suppressExpectedError(event: ErrorEvent) {
  if (isStaffSessionError(event.error) || event.error?.message === "Billing unavailable") event.preventDefault();
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); setStaffSessionToken(""); failure = null; calls.length = 0;
  role = "owner"; language = "en";
  vi.spyOn(console, "error").mockImplementation(() => {});
  window.addEventListener("error", suppressExpectedError);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  window.removeEventListener("error", suppressExpectedError); vi.restoreAllMocks();
});

async function mount(path: string) {
  const location = memoryLocation({ path, record: true });
  await act(async () => root.render(createElement(Router, { hook: location.hook,
    children: createElement(ErrorBoundary, null, createElement(StaffSessionRecovery, null, createElement(App))) })));
  return location;
}

describe("real App staff-auth boundary wiring", () => {
  it.each(["owner", "manager", "cleaner", "maintenance"] as const)("preserves guide-card visibility for %s through the real Manuals route", async currentRole => {
    role = currentRole; setStaffSessionToken("synthetic-session");
    await mount("/manuals");
    expect(host.querySelector('a[href="/manuals/manager"]') !== null).toBe(role === "owner" || role === "manager");
    expect(host.querySelector('a[href="/manuals/owner"]') !== null).toBe(role === "owner");
    expect(host.querySelector('a[href="/manuals/cleaner"]')).not.toBeNull();
    expect(calls).toContain("queries/manuals:getVisibleManuals");
    expect(calls).not.toContain("queries/manuals:exportManuals");
  });

  it.each(["en", "es"] as const)("lets a zero-capability Manager open the %s guide from its real card and route", async locale => {
    role = "manager"; language = locale; setStaffSessionToken("synthetic-session");
    const location = await mount("/manuals");
    const card = host.querySelector('a[href="/manuals/manager"]') as HTMLAnchorElement;
    expect(card.textContent).toContain((locale === "es" ? es : en).manuals.managerGuide);
    await act(async () => card.click());
    expect(location.history?.at(-1)).toBe("/manuals/manager");
    expect(host.querySelector("h1")?.textContent).toBe(locale === "es" ? "Guía de la aplicación para gerentes" : "Manager App Guide");
    expect(host.querySelectorAll("article h2")).toHaveLength(17);
    expect(calls.every(name => ["authQueries:getCurrentUser", "queries/billing:getCompanySubscription", "queries/manuals:getVisibleManuals"].includes(name))).toBe(true);
  });

  it("recovers App's top-level billing rejection to its actual sign-in route", async () => {
    setStaffSessionToken("synthetic-session");
    failure = new Error("A verified session is required. Please sign in again.");
    const location = await mount("/jobs");
    expect(host.querySelector('[data-testid="staff-sign-in"]')).not.toBeNull();
    expect(getStaffSessionToken()).toBe("");
    expect(location.history?.at(-1)).toBe("/login");
    expect(calls.filter(name => name === "queries/billing:getCompanySubscription").length).toBeLessThanOrEqual(4);
  });

  it("moves a mounted unauthenticated App into its workspace when a login/signup establishes a session", async () => {
    await mount("/login");
    expect(host.querySelector('[data-testid="staff-sign-in"]')).not.toBeNull();
    await act(async () => setStaffSessionToken("synthetic-new-session"));
    expect(host.querySelector('[data-testid="workspace"]')).not.toBeNull();
    expect(getStaffSessionToken()).toBe("synthetic-new-session");
  });

  it("keeps unrelated billing errors visible and does not expire a valid session", async () => {
    setStaffSessionToken("synthetic-session"); failure = new Error("Billing unavailable");
    await mount("/jobs");
    expect(host.textContent).toContain("Billing unavailable");
    expect(host.querySelector('[data-testid="staff-sign-in"]')).toBeNull();
    expect(getStaffSessionToken()).toBe("synthetic-session");
  });
});
