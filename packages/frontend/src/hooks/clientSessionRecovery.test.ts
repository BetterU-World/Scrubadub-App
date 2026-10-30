// @vitest-environment jsdom
import { act, createElement, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/client/account";
let version = 0;
const queryListeners = new Set<() => void>();
const routeListeners = new Set<() => void>();
const subscribeQueries = (listener: () => void) => { queryListeners.add(listener); return () => { queryListeners.delete(listener); }; };
const subscribeRoute = (listener: () => void) => { routeListeners.add(listener); return () => { routeListeners.delete(listener); }; };
const verdicts = new Map<string, "invalid" | "pending" | "null">();
const calls: { name: string; token?: string; skipped: boolean }[] = [];
let protectedError: Error | null;
let auths: Record<string, ReturnType<typeof useClientAuth>>;
const mocks = vi.hoisted(() => ({ signIn: vi.fn(), revoke: vi.fn(), navigate: vi.fn(), capture: vi.fn() }));
const rejection = () => new Error("[CONVEX Q(queries/clientAuth:getCurrentClientUser)] Server Error\nUncaught Error: A verified session is required. Please sign in again.\n at handler");

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@sentry/react", () => ({ captureException: mocks.capture }));
vi.mock("wouter", () => ({ useLocation: () => [useSyncExternalStore(subscribeRoute, () => pathname), mocks.navigate] }));
vi.mock("convex/react", () => ({
  useQuery: (reference: any, args: any) => {
    useSyncExternalStore(subscribeQueries, () => version);
    const name = getFunctionName(reference);
    calls.push({ name, token: args.sessionToken, skipped: args === "skip" });
    if (args === "skip") return undefined;
    if (name === "queries/clientAuth:getCurrentClientUser") {
      const verdict = verdicts.get(args.sessionToken);
      if (verdict === "invalid") throw rejection();
      if (verdict === "pending") return undefined;
      if (verdict === "null") return null;
      return { _id: "synthetic-client", displayName: "Client", status: "active" };
    }
    if (name === "queries/clientPortal:getClientAccount") {
      if (protectedError) throw protectedError;
      return { clientUser: { displayName: "Client" }, relationships: [] };
    }
    throw Error(`Unexpected synthetic query ${name}`);
  },
  useAction: (reference: any) => getFunctionName(reference) === "clientAuthActions:signIn" ? mocks.signIn : mocks.revoke,
}));

import { api } from "../../../../convex/_generated/api";
import { useQuery } from "convex/react";
import { useClientAuth } from "./useClientAuth";
import { ClientSessionRecovery } from "../components/client/ClientSessionRecovery";
import { StaffSessionRecovery } from "../components/shared/StaffSessionRecovery";
import { ErrorBoundary } from "../components/shared/ErrorBoundary";
import { CLIENT_SESSION_KEY, getClientSessionToken, invalidateClientSession, setClientSessionToken } from "../lib/clientSession";
import { getStaffSessionToken, setStaffSessionToken } from "../lib/staffSession";
import { isClientSessionError } from "../lib/clientSessionError";

function Consumer({ name }: { name: string }) {
  const auth = useClientAuth(); auths[name] = auth;
  return createElement("output", null, auth.isLoading ? "loading" : auth.clientUserId ? "client-ready" : "client-sign-in");
}
function Portal() {
  const auth = useClientAuth(); auths.portal = auth;
  useQuery((api as any).queries.clientPortal.getClientAccount, auth.clientUserId && auth.sessionToken ? { clientUserId: auth.clientUserId, sessionToken: auth.sessionToken } : "skip");
  return createElement(Consumer, { name: "page" });
}
function Tree({ children = createElement(Portal) }: { children?: ReactNode }) {
  return createElement(ErrorBoundary, null, createElement(StaffSessionRecovery, null,
    createElement(ClientSessionRecovery, null, children)));
}
let host: HTMLDivElement;
let root: Root;
async function render(children?: ReactNode) { await act(async () => root.render(createElement(Tree, { children }))); }
function silenceExpectedErrors(event: ErrorEvent) {
  if (isClientSessionError(event.error) || event.error?.message === "Document service unavailable") event.preventDefault();
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); setClientSessionToken(""); setStaffSessionToken("synthetic-staff");
  pathname = "/client/account"; verdicts.clear(); calls.length = 0; protectedError = null; auths = {};
  mocks.signIn.mockReset().mockResolvedValue({ sessionToken: "synthetic-new-client" });
  mocks.revoke.mockReset().mockResolvedValue({ revoked: true }); mocks.capture.mockReset();
  mocks.navigate.mockReset().mockImplementation((href: string) => { pathname = href.split("?")[0]; for (const listener of routeListeners) listener(); });
  vi.spyOn(console, "error").mockImplementation(() => {});
  window.addEventListener("error", silenceExpectedErrors);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  window.removeEventListener("error", silenceExpectedErrors); vi.restoreAllMocks();
});

describe("mounted Client Portal session recovery", () => {
  it("shares valid hydration across mounted client consumers without credential storage reads on rerender", async () => {
    setClientSessionToken("synthetic-client"); await render();
    expect(auths.portal.isAuthenticated && auths.page.isAuthenticated).toBe(true);
    expect(auths.portal.sessionToken).toBe(auths.page.sessionToken);
    const read = vi.spyOn(Storage.prototype, "getItem");
    await act(async () => { version++; for (const listener of queryListeners) listener(); });
    expect(read.mock.calls.filter(([key]) => key === CLIENT_SESSION_KEY)).toHaveLength(0);
  });

  it("keeps protected subscriptions skipped until client principal readiness", async () => {
    setClientSessionToken("synthetic-pending"); verdicts.set("synthetic-pending", "pending"); await render();
    expect(auths.portal.isLoading).toBe(true);
    expect(calls.filter(c => c.name !== "queries/clientAuth:getCurrentClientUser").every(c => c.skipped)).toBe(true);
    expect(getClientSessionToken()).toBe("synthetic-pending");
  });

  it("missing credentials reach client login without protected requests", async () => {
    await render();
    expect(pathname).toBe("/client/login");
    expect(calls.every(c => c.skipped)).toBe(true);
    expect(getStaffSessionToken()).toBe("synthetic-staff");
  });

  it.each(["expired", "revoked", "invalid"])("recovers a throwing %s hydration query without treating it as a service outage", async () => {
    setClientSessionToken("synthetic-invalid"); verdicts.set("synthetic-invalid", "invalid"); await render();
    expect(getClientSessionToken()).toBe("");
    expect(pathname).toBe("/client/login");
    expect(host.textContent).toContain("client-sign-in");
    expect(calls.some(c => c.name === "queries/clientPortal:getClientAccount" && !c.skipped)).toBe(false);
    expect(getStaffSessionToken()).toBe("synthetic-staff");
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("does not let invalid stored credentials trap the login route", async () => {
    pathname = "/client/login"; setClientSessionToken("synthetic-invalid"); verdicts.set("synthetic-invalid", "invalid");
    await render();
    expect(getClientSessionToken()).toBe("");
    expect(host.textContent).toContain("client-sign-in");
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("same-tab login updates every mounted client consumer and leaves staff authenticated", async () => {
    pathname = "/client/login"; await render();
    await act(async () => { await auths.page.signIn({ email: "synthetic@example.invalid", password: "synthetic-password" }); });
    expect(auths.portal.isAuthenticated && auths.page.isAuthenticated).toBe(true);
    expect(auths.portal.sessionToken).toBe("synthetic-new-client");
    expect(getStaffSessionToken()).toBe("synthetic-staff");
  });

  it("same-tab logout clears client UI and revokes only the captured client credential", async () => {
    setClientSessionToken("synthetic-client"); await render();
    await act(async () => auths.page.signOut());
    expect(auths.portal.isAuthenticated || auths.page.isAuthenticated).toBe(false);
    expect(pathname).toBe("/client/login");
    expect(mocks.revoke).toHaveBeenCalledWith({ sessionToken: "synthetic-client" });
    expect(getStaffSessionToken()).toBe("synthetic-staff");
  });

  it("cross-tab session replacement and logout update all client components", async () => {
    setClientSessionToken("synthetic-a"); await render();
    await act(async () => {
      localStorage.setItem(CLIENT_SESSION_KEY, "synthetic-b");
      window.dispatchEvent(new StorageEvent("storage", { key: CLIENT_SESSION_KEY, storageArea: localStorage }));
    });
    expect(auths.page.sessionToken).toBe("synthetic-b");
    await act(async () => {
      localStorage.removeItem(CLIENT_SESSION_KEY);
      window.dispatchEvent(new StorageEvent("storage", { key: CLIENT_SESSION_KEY, storageArea: localStorage }));
    });
    expect(auths.portal.isAuthenticated).toBe(false);
    expect(pathname).toBe("/client/login");
    expect(getStaffSessionToken()).toBe("synthetic-staff");
  });

  it("a stale null result cannot clear a newer client established before effect cleanup", async () => {
    setClientSessionToken("synthetic-old"); verdicts.set("synthetic-old", "null");
    function LoginWinsRace() {
      const auth = useClientAuth(); auths.race = auth;
      useLayoutEffect(() => { if (auth.sessionToken === "synthetic-old") setClientSessionToken("synthetic-new"); }, [auth.sessionToken]);
      return null;
    }
    await render(createElement(LoginWinsRace));
    expect(auths.race.isAuthenticated).toBe(true);
    expect(getClientSessionToken()).toBe("synthetic-new");
    expect(invalidateClientSession("synthetic-old")).toBe(false);
  });

  it("a late login response cannot overwrite a newer established client", async () => {
    pathname = "/client/login"; await render();
    let resolve!: (value: { sessionToken: string }) => void;
    mocks.signIn.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    let pending!: Promise<unknown>;
    await act(async () => { pending = auths.page.signIn({ email: "synthetic@example.invalid", password: "synthetic-password" }); });
    await act(async () => setClientSessionToken("synthetic-newer-client"));
    await act(async () => { resolve({ sessionToken: "synthetic-late-client" }); await pending; });
    expect(getClientSessionToken()).toBe("synthetic-newer-client");
    expect(auths.portal.isAuthenticated).toBe(true);
  });

  it("recovers a protected-query session rejection before hydration changes", async () => {
    setClientSessionToken("synthetic-client"); protectedError = rejection(); await render();
    expect(pathname).toBe("/client/login");
    expect(getClientSessionToken()).toBe("");
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("retains valid credentials for unrelated service or relationship failures", async () => {
    setClientSessionToken("synthetic-client"); protectedError = new Error("Document service unavailable"); await render();
    expect(getClientSessionToken()).toBe("synthetic-client");
    expect(getStaffSessionToken()).toBe("synthetic-staff");
    expect(host.textContent).toContain("Document service unavailable");
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.capture).toHaveBeenCalled();
  });

  it("does not resubscribe rejected credentials after reconnect or a complete remount", async () => {
    setClientSessionToken("synthetic-old"); verdicts.set("synthetic-old", "invalid"); await render();
    const oldCalls = calls.filter(c => c.token === "synthetic-old").length;
    await act(async () => { version++; for (const listener of queryListeners) listener(); });
    await act(async () => root.unmount()); root = createRoot(host); await render();
    expect(calls.filter(c => c.token === "synthetic-old")).toHaveLength(oldCalls);
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });

  it("restores a valid session through a complete portal remount without logging in again", async () => {
    setClientSessionToken("synthetic-valid"); await render();
    await act(async () => root.unmount()); root = createRoot(host); await render();
    expect(auths.portal.isAuthenticated && auths.page.isAuthenticated).toBe(true);
    expect(getClientSessionToken()).toBe("synthetic-valid");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("preserves an unsent client draft through unrelated staff changes", async () => {
    setClientSessionToken("synthetic-client");
    function Draft() {
      useClientAuth(); const [text, setText] = useState("empty");
      return createElement("button", { onClick: () => setText("unsent client draft") }, text);
    }
    await render(createElement(Draft));
    await act(async () => host.querySelector("button")!.click());
    await act(async () => setStaffSessionToken("synthetic-other-staff"));
    expect(host.textContent).toBe("unsent client draft");
    expect(getClientSessionToken()).toBe("synthetic-client");
  });
});
