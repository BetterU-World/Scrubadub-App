// @vitest-environment jsdom
import { act, createElement, useState, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invalid = new Set<string>();
let version = 0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const calls: string[] = [];
let accountError: Error | null;
const mocks = vi.hoisted(() => ({ signIn: vi.fn(), invite: vi.fn(), inviteInfo: vi.fn(), reset: vi.fn(), requestReset: vi.fn(), revoke: vi.fn(), capture: vi.fn() }));
const rejectSession = () => new Error("[CONVEX Q(queries/clientAuth:getCurrentClientUser)] Server Error\nUncaught Error: A verified session is required. Please sign in again.\n at handler");

vi.mock("convex/react", () => ({
  useQuery: (reference: any, args: any) => {
    useSyncExternalStore(subscribe, () => version);
    if (args === "skip") return undefined;
    const name = getFunctionName(reference); calls.push(name);
    if (name === "authQueries:getCurrentUser") return { _id: "staff", companyId: "company", role: "owner", status: "active", isSuperadmin: false };
    if (name === "queries/clientAuth:getCurrentClientUser") {
      if (invalid.has(args.sessionToken)) throw rejectSession();
      return { _id: "client", displayName: "Synthetic Client", email: "client@example.invalid", status: "active" };
    }
    if (name === "queries/clientPortal:getClientAccount") {
      if (accountError) throw accountError;
      return { clientUser: { displayName: "Synthetic Client", email: "client@example.invalid" }, relationships: [] };
    }
    throw Error(`Unexpected query ${name}`);
  },
  useAction: (reference: any) => {
    switch (getFunctionName(reference)) {
      case "clientAuthActions:signIn": return mocks.signIn;
      case "clientAuthActions:acceptInvite": return mocks.invite;
      case "clientAuthActions:getInviteInfo": return mocks.inviteInfo;
      case "clientAuthActions:resetPassword": return mocks.reset;
      case "clientAuthActions:requestPasswordReset": return mocks.requestReset;
      default: return mocks.revoke;
    }
  },
  useMutation: () => vi.fn(), usePaginatedQuery: () => ({}), useConvex: () => ({}),
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en", changeLanguage: vi.fn() } }) }));
vi.mock("@sentry/react", () => ({ captureException: mocks.capture }));
vi.mock("@vercel/analytics/react", () => ({ Analytics: () => null }));
vi.mock("@/components/shared/OfflineIndicator", () => ({ OfflineIndicator: () => null }));
vi.mock("@/pages/client/ClientHomePage", () => ({ ClientHomePage: () => {
  const auth = useClientAuth(); const [draft, setDraft] = useState("empty draft");
  return createElement("button", { "data-testid": "client-home", onClick: () => setDraft("unsent draft") }, auth.clientUserId ? draft : "signed-out");
} }));

import App from "./App";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";
import { StaffSessionRecovery } from "./components/shared/StaffSessionRecovery";
import { useClientAuth } from "./hooks/useClientAuth";
import { getClientSessionToken, setClientSessionToken } from "./lib/clientSession";
import { getStaffSessionToken, setStaffSessionToken } from "./lib/staffSession";
import { isClientSessionError } from "./lib/clientSessionError";

let host: HTMLDivElement;
let root: Root;
function suppressExpectedErrors(event: ErrorEvent) {
  if (isClientSessionError(event.error) || event.error?.message === "Client relationship access required") event.preventDefault();
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); setClientSessionToken(""); setStaffSessionToken("synthetic-staff");
  window.history.replaceState(null, "", "/"); invalid.clear(); calls.length = 0; accountError = null;
  mocks.signIn.mockReset().mockResolvedValue({ sessionToken: "synthetic-new-client" });
  mocks.invite.mockReset().mockResolvedValue({ sessionToken: "synthetic-invited-client" });
  mocks.inviteInfo.mockReset().mockResolvedValue({ email: "client@example.invalid", displayName: "Synthetic Client" });
  mocks.reset.mockReset().mockResolvedValue({ success: true }); mocks.requestReset.mockReset().mockResolvedValue({ success: true });
  mocks.revoke.mockReset().mockResolvedValue({ revoked: true }); mocks.capture.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  window.addEventListener("error", suppressExpectedErrors);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); window.removeEventListener("error", suppressExpectedErrors); vi.restoreAllMocks();
});
async function mount(path: string) {
  window.history.replaceState(null, "", path);
  const location = memoryLocation({ path, record: true });
  await act(async () => root.render(createElement(Router, { hook: location.hook, children:
    createElement(ErrorBoundary, null, createElement(StaffSessionRecovery, null, createElement(App))) })));
  return location;
}
async function fill(selector: string, value: string) {
  const input = host.querySelector(selector) as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() { await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }

describe("real client routes and entry forms", () => {
  it("makes client login usable after an invalid stored credential", async () => {
    setClientSessionToken("synthetic-expired"); invalid.add("synthetic-expired");
    await mount("/client/login");
    expect(host.querySelector('input[type="email"]')).not.toBeNull();
    expect(getClientSessionToken()).toBe("");
    expect(getStaffSessionToken()).toBe("synthetic-staff");
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(calls).not.toContain("queries/billing:getCompanySubscription");
  });

  it("uses the actual client sign-in form and a safe protected return destination", async () => {
    await mount("/client/login?next=%2Fclient%2Faccount");
    await fill('input[type="email"]', "client@example.invalid");
    await fill('input[type="password"]', "synthetic-password");
    await submit();
    expect(mocks.signIn).toHaveBeenCalledWith({ email: "client@example.invalid", password: "synthetic-password" });
    expect(getClientSessionToken()).toBe("synthetic-new-client");
    expect(host.textContent).toContain("Synthetic Client");
    expect(host.querySelector("form")).toBeNull();
    expect(getStaffSessionToken()).toBe("synthetic-staff");
  });

  it("accepts a client invitation even when the stored client credential is expired", async () => {
    setClientSessionToken("synthetic-expired"); invalid.add("synthetic-expired");
    await mount("/client/accept-invite/synthetic-invite");
    for (const input of host.querySelectorAll('input[type="password"]')) await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "synthetic-password");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await submit();
    expect(mocks.invite).toHaveBeenCalledWith({ token: "synthetic-invite", password: "synthetic-password" });
    expect(getClientSessionToken()).toBe("synthetic-invited-client");
    expect(host.querySelector('[data-testid="client-home"]')).not.toBeNull();
    expect(getStaffSessionToken()).toBe("synthetic-staff");
  });

  it("does not install or navigate from an old invitation response after a new login", async () => {
    const location = await mount("/client/accept-invite/synthetic-invite");
    const passwords = host.querySelectorAll('input[type="password"]');
    for (const input of passwords) await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "synthetic-password");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    let resolve!: (value: { sessionToken: string }) => void;
    mocks.invite.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    await submit();
    await act(async () => setClientSessionToken("synthetic-newer-client"));
    await act(async () => resolve({ sessionToken: "synthetic-late-invite" }));
    expect(getClientSessionToken()).toBe("synthetic-newer-client");
    expect(location.history?.at(-1)).toBe("/client/accept-invite/synthetic-invite");
  });

  it("keeps password recovery accessible and completes reset without clearing another principal", async () => {
    setClientSessionToken("synthetic-old-client");
    mocks.reset.mockImplementationOnce(async () => { invalid.add("synthetic-old-client"); return { success: true }; });
    await mount("/client/reset-password/synthetic-reset");
    for (const input of host.querySelectorAll('input[type="password"]')) await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "synthetic-new-password");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await submit();
    expect(mocks.reset).toHaveBeenCalledWith({ token: "synthetic-reset", newPassword: "synthetic-new-password" });
    expect(host.textContent).toContain("clientAuth.resetSuccess");
    expect(getStaffSessionToken()).toBe("synthetic-staff");
    await act(async () => (host.querySelector('a[href="/client/login"]') as HTMLAnchorElement).click());
    expect(host.querySelector('input[type="email"]')).not.toBeNull();
    expect(getClientSessionToken()).toBe("");
  });

  it("lets an invalid stored client request a password reset", async () => {
    setClientSessionToken("synthetic-invalid"); invalid.add("synthetic-invalid");
    await mount("/client/forgot-password");
    await fill('input[type="email"]', "client@example.invalid"); await submit();
    expect(mocks.requestReset).toHaveBeenCalledWith({ email: "client@example.invalid" });
    expect(host.textContent).toContain("clientAuth.resetEmailSent");
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("missing credentials on a protected route reach client login with no private subscriptions", async () => {
    await mount("/client/account");
    expect(host.querySelector('input[type="email"]')).not.toBeNull();
    expect(calls).not.toContain("queries/clientPortal:getClientAccount");
    expect(getStaffSessionToken()).toBe("synthetic-staff");
  });

  it("the real portal sign-out button clears client state without signing staff out", async () => {
    setClientSessionToken("synthetic-client"); await mount("/client/account");
    const logout = Array.from(host.querySelectorAll("button")).find(b => b.textContent === "auth.signOut")!;
    await act(async () => logout.click());
    expect(getClientSessionToken()).toBe("");
    expect(host.querySelector('input[type="email"]')).not.toBeNull();
    expect(getStaffSessionToken()).toBe("synthetic-staff");
    expect(mocks.revoke).toHaveBeenCalledWith({ sessionToken: "synthetic-client" });
  });

  it("preserves client draft state through unrelated staff-session changes in the real App", async () => {
    setClientSessionToken("synthetic-client"); await mount("/client/home");
    await act(async () => (host.querySelector('[data-testid="client-home"]') as HTMLButtonElement).click());
    await act(async () => setStaffSessionToken("synthetic-other-staff"));
    expect(host.textContent).toContain("unsent draft");
    expect(getClientSessionToken()).toBe("synthetic-client");
  });

  it("does not classify relationship authorization failures as expired sessions", async () => {
    setClientSessionToken("synthetic-client"); accountError = new Error("Client relationship access required");
    await mount("/client/account");
    expect(host.textContent).toContain("Client relationship access required");
    expect(getClientSessionToken()).toBe("synthetic-client");
    expect(getStaffSessionToken()).toBe("synthetic-staff");
  });
});
