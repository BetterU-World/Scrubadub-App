// @vitest-environment jsdom
import { act, createElement, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/jobs";
let queryVersion = 0;
const queryListeners = new Set<() => void>();
const routeListeners = new Set<() => void>();
const querySubscribe = (listener: () => void) => { queryListeners.add(listener); return () => { queryListeners.delete(listener); }; };
const routeSubscribe = (listener: () => void) => { routeListeners.add(listener); return () => { routeListeners.delete(listener); }; };
const verdicts = new Map<string, "valid" | "pending" | "invalid">();
let billingError: Error | null;
let protectedError: Error | null;
let role = "owner";
let auths: Record<string, ReturnType<typeof useAuth>>;
const queries: { name: string; token?: string; skipped: boolean }[] = [];
const mocks = vi.hoisted(() => ({ signIn: vi.fn(), signUp: vi.fn(), revoke: vi.fn(), capture: vi.fn(), navigate: vi.fn() }));
const sessionError = () => new Error("[CONVEX Q(queries/billing:getCompanySubscription)] Server Error\nUncaught Error: A verified session is required. Please sign in again.\n at handler");

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@sentry/react", () => ({ captureException: mocks.capture }));
vi.mock("wouter", () => ({
  useLocation: () => [useSyncExternalStore(routeSubscribe, () => pathname), mocks.navigate],
  Link: ({ href, children }: { href: string; children: ReactNode }) => createElement("a", { href }, children),
}));
vi.mock("convex/react", () => ({
  useQuery: (reference: any, args: any) => {
    useSyncExternalStore(querySubscribe, () => queryVersion);
    const name = getFunctionName(reference);
    queries.push({ name, token: args.sessionToken, skipped: args === "skip" });
    if (args === "skip") return undefined;
    if (name === "authQueries:getCurrentUser") {
      if (verdicts.get(args.sessionToken) === "pending") return undefined;
      if (verdicts.get(args.sessionToken) === "invalid") return null;
      return { _id: "staff", companyId: "company", role, status: "active", isSuperadmin: role === "owner", canManageSchedule: false };
    }
    if (name === "queries/billing:getCompanySubscription") {
      if (billingError) throw billingError;
      return { subscriptionStatus: "active" };
    }
    if (name === "queries/notifications:unreadCount") {
      if (protectedError) throw protectedError;
      return 0;
    }
    throw Error(`Unexpected synthetic query ${name}`);
  },
  useAction: (reference: any) => {
    const name = getFunctionName(reference);
    return name === "authActions:signIn" ? mocks.signIn : name === "authActions:signUp" ? mocks.signUp : mocks.revoke;
  },
  useMutation: () => vi.fn().mockResolvedValue(undefined),
}));

import { api } from "../../../../convex/_generated/api";
import { useAuth } from "./useAuth";
import { StaffSessionRecovery } from "../components/shared/StaffSessionRecovery";
import { ErrorBoundary } from "../components/shared/ErrorBoundary";
import { STAFF_SESSION_KEY, getStaffSessionToken, invalidateStaffSession, setStaffSessionToken } from "../lib/staffSession";
import { useQuery } from "convex/react";
import { isStaffSessionError } from "../lib/staffSessionError";

function preventExpectedError(event: ErrorEvent) {
  if (isStaffSessionError(event.error) || event.error?.message === "Billing service unavailable") event.preventDefault();
}

function Consumer({ name }: { name: string }) {
  const auth = useAuth(); auths[name] = auth;
  return createElement("output", { "data-consumer": name }, auth.isLoading ? "loading" : auth.user ? auth.user.role : "signed-out");
}

function ProtectedPage() {
  const auth = useAuth();
  useQuery(api.queries.notifications.unreadCount, auth.user ? { userId: auth.user._id, sessionToken: getStaffSessionToken() } : "skip");
  return createElement(Consumer, { name: "page" });
}

/** Mirrors App's billing hook above the inner staff ErrorBoundary. */
function MountedShell() {
  const auth = useAuth(); auths.shell = auth;
  useQuery(api.queries.billing.getCompanySubscription, auth.user?.companyId && auth.sessionToken ? { companyId: auth.user.companyId, sessionToken: auth.sessionToken } : "skip");
  return auth.user
    ? createElement(ErrorBoundary, { recoverStaffSession: true, children: createElement(ProtectedPage) })
    : createElement(Consumer, { name: "page" });
}

function Tree({ children = createElement(MountedShell) }: { children?: ReactNode }) {
  return createElement(ErrorBoundary, null, createElement(StaffSessionRecovery, null, children));
}

let root: Root;
let host: HTMLDivElement;
async function render(children?: ReactNode) { await act(async () => root.render(createElement(Tree, { children }))); }
async function updateQueries() { await act(async () => { queryVersion++; for (const listener of queryListeners) listener(); }); }

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); setStaffSessionToken(""); auths = {}; verdicts.clear(); queries.length = 0;
  billingError = null; protectedError = null; role = "owner"; pathname = "/jobs";
  mocks.signIn.mockReset().mockResolvedValue({ sessionToken: "synthetic-new" });
  mocks.signUp.mockReset().mockResolvedValue({ sessionToken: "synthetic-new" });
  mocks.revoke.mockReset().mockResolvedValue({ revoked: true }); mocks.capture.mockReset();
  mocks.navigate.mockReset().mockImplementation((path: string) => { pathname = path; for (const listener of routeListeners) listener(); });
  vi.spyOn(console, "error").mockImplementation(() => {}); // React reports intentionally thrown test errors.
  window.addEventListener("error", preventExpectedError);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); window.removeEventListener("error", preventExpectedError); vi.restoreAllMocks(); });

describe("mounted staff session recovery", () => {
  it("restores one shared valid session in two mounted consumers without storage reads on rerender", async () => {
    setStaffSessionToken("synthetic-a"); await render();
    expect(auths.shell.sessionToken).toBe(auths.page.sessionToken);
    expect(auths.shell.isAuthenticated && auths.page.isAuthenticated).toBe(true);
    const read = vi.spyOn(Storage.prototype, "getItem");
    await updateQueries();
    expect(read.mock.calls.filter(([key]) => key === STAFF_SESSION_KEY)).toHaveLength(0);
  });

  it("keeps a valid credential and verified principal through a complete shell remount", async () => {
    setStaffSessionToken("synthetic-valid"); await render();
    await act(async () => root.unmount()); root = createRoot(host); await render();
    expect(auths.shell.isAuthenticated && auths.page.isAuthenticated).toBe(true);
    expect(getStaffSessionToken()).toBe("synthetic-valid");
    expect(localStorage.getItem(STAFF_SESSION_KEY)).toBe("synthetic-valid");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it.each(["signIn", "signUp"] as const)("%s updates the mounted shell and every consumer immediately", async method => {
    await render();
    await act(async () => {
      if (method === "signUp") await auths.page.signUp({ email: "synthetic@example.invalid", password: "synthetic-password", name: "Synthetic", companyName: "Synthetic" });
      else await auths.page.signIn({ email: "synthetic@example.invalid", password: "synthetic-password" });
    });
    expect(auths.shell.isAuthenticated && auths.page.isAuthenticated).toBe(true);
    expect(auths.shell.sessionToken).toBe("synthetic-new");
    expect(auths.page.sessionToken).toBe("synthetic-new");
    expect(mocks.navigate).not.toHaveBeenCalledWith("/login", expect.anything());
  });

  it("same-tab logout stops mounted protected subscriptions before navigation", async () => {
    setStaffSessionToken("synthetic-a"); await render();
    await act(async () => auths.page.signOut());
    expect(auths.shell.isAuthenticated).toBe(false);
    expect(auths.page.isAuthenticated).toBe(false);
    expect(localStorage.getItem(STAFF_SESSION_KEY)).toBeNull();
    expect(mocks.revoke).toHaveBeenCalledWith({ sessionToken: "synthetic-a" });
    expect(pathname).toBe("/login");
  });

  it("cross-tab replacement and logout update the mounted shell", async () => {
    setStaffSessionToken("synthetic-a"); await render();
    await act(async () => {
      localStorage.setItem(STAFF_SESSION_KEY, "synthetic-b");
      window.dispatchEvent(new StorageEvent("storage", { key: STAFF_SESSION_KEY, storageArea: localStorage }));
    });
    expect(auths.shell.sessionToken).toBe("synthetic-b");
    expect(auths.page.sessionToken).toBe("synthetic-b");
    await act(async () => {
      localStorage.removeItem(STAFF_SESSION_KEY);
      window.dispatchEvent(new StorageEvent("storage", { key: STAFF_SESSION_KEY, storageArea: localStorage }));
    });
    expect(auths.shell.isAuthenticated).toBe(false);
    expect(pathname).toBe("/login");
  });

  it("does not start protected subscriptions before principal readiness", async () => {
    setStaffSessionToken("synthetic-pending"); verdicts.set("synthetic-pending", "pending");
    await render();
    expect(auths.shell.isLoading).toBe(true);
    expect(queries.filter(q => q.name !== "authQueries:getCurrentUser").every(q => q.skipped)).toBe(true);
    expect(localStorage.getItem(STAFF_SESSION_KEY)).toBe("synthetic-pending");
  });

  it.each(["expired", "revoked", "password-reset"])("recovers %s hydration to usable sign-in without protected requests", async () => {
    setStaffSessionToken("synthetic-invalid"); verdicts.set("synthetic-invalid", "invalid");
    await render();
    expect(auths.shell.isAuthenticated).toBe(false);
    expect(pathname).toBe("/login");
    expect(queries.filter(q => q.name !== "authQueries:getCurrentUser").every(q => q.skipped)).toBe(true);
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("an old null hydration effect cannot clear a fresh login established before cleanup", async () => {
    setStaffSessionToken("synthetic-old"); verdicts.set("synthetic-old", "invalid");
    function LoginWinsRace() {
      const auth = useAuth(); auths.race = auth;
      useLayoutEffect(() => { if (auth.sessionToken === "synthetic-old") setStaffSessionToken("synthetic-new"); }, [auth.sessionToken]);
      return null;
    }
    await render(createElement(LoginWinsRace));
    expect(getStaffSessionToken()).toBe("synthetic-new");
    expect(auths.race.isAuthenticated).toBe(true);
    expect(invalidateStaffSession("synthetic-old")).toBe(false);
  });

  it("a late login response cannot replace a session established while it was in flight", async () => {
    await render();
    let resolve!: (value: { sessionToken: string }) => void;
    mocks.signIn.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    let login!: Promise<unknown>;
    await act(async () => { login = auths.page.signIn({ email: "synthetic@example.invalid", password: "synthetic-password" }); });
    await act(async () => setStaffSessionToken("synthetic-newer-login"));
    await act(async () => { resolve({ sessionToken: "synthetic-late-login" }); await login; });
    expect(getStaffSessionToken()).toBe("synthetic-newer-login");
    expect(auths.shell.isAuthenticated).toBe(true);
  });

  it.each(["billing", "protected"])("recovers a %s query rejection even before hydration notices invalidation", async source => {
    setStaffSessionToken("synthetic-a");
    if (source === "billing") billingError = sessionError(); else protectedError = sessionError();
    await render();
    expect(pathname).toBe("/login");
    expect(getStaffSessionToken()).toBe("");
    expect(host.textContent).toContain("signed-out");
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("does not reissue rejected subscriptions on reconnection or remount, and permits fresh login", async () => {
    setStaffSessionToken("synthetic-old"); billingError = sessionError(); await render();
    const rejectedCalls = queries.filter(q => q.token === "synthetic-old").length;
    await updateQueries();
    await act(async () => root.unmount()); root = createRoot(host); await render();
    expect(queries.filter(q => q.token === "synthetic-old")).toHaveLength(rejectedCalls);
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    await act(async () => mocks.navigate("/privacy"));
    expect(pathname).toBe("/privacy"); // Recovery must not keep redirecting public navigation.
    billingError = null;
    await act(async () => auths.page.signIn({ email: "synthetic@example.invalid", password: "synthetic-password" }));
    expect(auths.shell.isAuthenticated).toBe(true);
    expect(auths.shell.sessionToken).toBe("synthetic-new");
  });

  it("does not disguise unrelated billing failures as expiration or discard the session", async () => {
    setStaffSessionToken("synthetic-a"); billingError = new Error("Billing service unavailable");
    await render();
    expect(getStaffSessionToken()).toBe("synthetic-a");
    expect(host.textContent).toContain("Billing service unavailable");
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.capture).toHaveBeenCalled();
  });

  it("does not recover a Client Portal rejection by clearing staff credentials", async () => {
    pathname = "/client/home"; setStaffSessionToken("synthetic-staff");
    function ClientFailure(): ReactNode { throw sessionError(); }
    await render(createElement(ClientFailure));
    expect(getStaffSessionToken()).toBe("synthetic-staff");
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.capture).toHaveBeenCalled();
  });

  it("does not remount Client Portal content when another tab replaces a staff session", async () => {
    pathname = "/client/home"; setStaffSessionToken("synthetic-staff-a");
    function ClientDraft() {
      const [draft, setDraft] = useState("empty");
      return createElement("button", { onClick: () => setDraft("unsent client draft") }, draft);
    }
    await render(createElement(ClientDraft));
    await act(async () => host.querySelector("button")!.click());
    await act(async () => setStaffSessionToken("synthetic-staff-b"));
    expect(host.textContent).toBe("unsent client draft");
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it.each(["manager", "cleaner", "owner"])("preserves the verified %s role and its capability flags", async principalRole => {
    role = principalRole; setStaffSessionToken("synthetic-a"); await render();
    expect(auths.page.user?.role).toBe(principalRole);
    expect(auths.page.user?.canManageSchedule).toBe(false);
    expect(auths.page.user?.isSuperadmin).toBe(principalRole === "owner");
  });
});
