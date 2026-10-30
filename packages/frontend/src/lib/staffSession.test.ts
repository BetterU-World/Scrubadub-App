// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STAFF_SESSION_KEY, clearStaffSession, getStaffSessionSnapshot, getStaffSessionToken,
  invalidateStaffSession, setStaffSessionToken, subscribeStaffSession,
} from "./staffSession";
import { isStaffSessionError } from "./staffSessionError";

let unsubscribe: (() => void) | undefined;
beforeEach(() => { localStorage.clear(); setStaffSessionToken(""); });
afterEach(() => { unsubscribe?.(); unsubscribe = undefined; vi.restoreAllMocks(); });

function externalChange(value: string | null, eventValue = value) {
  if (value === null) localStorage.removeItem(STAFF_SESSION_KEY);
  else localStorage.setItem(STAFF_SESSION_KEY, value);
  window.dispatchEvent(new StorageEvent("storage", { key: STAFF_SESSION_KEY, newValue: eventValue, storageArea: localStorage }));
}

describe("shared staff session store", () => {
  it("publishes same-tab changes and supplies the same credential to legacy callers", () => {
    const listener = vi.fn(); unsubscribe = subscribeStaffSession(listener);
    setStaffSessionToken("synthetic-a");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getStaffSessionSnapshot().token).toBe("synthetic-a");
    expect(getStaffSessionToken()).toBe("synthetic-a");
    clearStaffSession();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(getStaffSessionToken()).toBe("");
  });

  it("does not reread storage when snapshots/accessors are read during render", () => {
    setStaffSessionToken("synthetic-a");
    const read = vi.spyOn(Storage.prototype, "getItem");
    const first = getStaffSessionSnapshot();
    expect(getStaffSessionSnapshot()).toBe(first);
    expect(getStaffSessionToken()).toBe(first.token);
    expect(read).not.toHaveBeenCalled();
  });

  it("synchronizes cross-tab replacement and logout", () => {
    unsubscribe = subscribeStaffSession(vi.fn());
    setStaffSessionToken("synthetic-a");
    externalChange("synthetic-b");
    expect(getStaffSessionToken()).toBe("synthetic-b");
    externalChange(null);
    expect(getStaffSessionSnapshot()).toMatchObject({ token: "", recoveryRequired: true });
  });

  it("ignores delayed event contents and unrelated/client storage changes", () => {
    unsubscribe = subscribeStaffSession(vi.fn());
    setStaffSessionToken("synthetic-a");
    externalChange("synthetic-new", "synthetic-old");
    expect(getStaffSessionToken()).toBe("synthetic-new");
    window.dispatchEvent(new StorageEvent("storage", { key: "scrubadub_clientSessionToken", newValue: "client" }));
    expect(getStaffSessionToken()).toBe("synthetic-new");
  });

  it("handles localStorage.clear events and changes made while unsubscribed", () => {
    setStaffSessionToken("synthetic-a");
    unsubscribe = subscribeStaffSession(vi.fn());
    localStorage.clear();
    window.dispatchEvent(new StorageEvent("storage", { key: null, storageArea: localStorage }));
    expect(getStaffSessionToken()).toBe("");
    unsubscribe();
    localStorage.setItem(STAFF_SESSION_KEY, "synthetic-b");
    unsubscribe = subscribeStaffSession(vi.fn());
    expect(getStaffSessionToken()).toBe("synthetic-b");
  });

  it("conditionally clears the rejected credential once", () => {
    setStaffSessionToken("synthetic-a");
    expect(invalidateStaffSession("synthetic-a")).toBe(true);
    const revision = getStaffSessionSnapshot().revision;
    expect(invalidateStaffSession("synthetic-a")).toBe(false);
    expect(getStaffSessionSnapshot().revision).toBe(revision);
    expect(localStorage.getItem(STAFF_SESSION_KEY)).toBeNull();
  });

  it("cannot clear a newer same-tab login or a replacement before its storage event arrives", () => {
    setStaffSessionToken("synthetic-new");
    expect(invalidateStaffSession("synthetic-old")).toBe(false);
    localStorage.setItem(STAFF_SESSION_KEY, "synthetic-other-tab");
    expect(invalidateStaffSession("synthetic-new")).toBe(false);
    expect(getStaffSessionToken()).toBe("synthetic-other-tab");
    expect(localStorage.getItem(STAFF_SESSION_KEY)).toBe("synthetic-other-tab");
  });

  it("does not install a late authentication response over a newer session", () => {
    const revision = getStaffSessionSnapshot().revision;
    setStaffSessionToken("synthetic-new");
    expect(setStaffSessionToken("synthetic-late-response", revision)).toBe(false);
    expect(getStaffSessionToken()).toBe("synthetic-new");
  });

  it("retains a usable in-memory credential when browser storage writes are unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw Error("Storage unavailable"); });
    setStaffSessionToken("synthetic-a");
    unsubscribe = subscribeStaffSession(vi.fn());
    expect(getStaffSessionToken()).toBe("synthetic-a");
    expect(invalidateStaffSession("synthetic-a")).toBe(true);
    expect(getStaffSessionToken()).toBe("");
  });

  it("protects a new persisted credential even after falling back to memory-only storage", () => {
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw Error("Storage unavailable"); });
    setStaffSessionToken("synthetic-memory");
    write.mockRestore();
    localStorage.setItem(STAFF_SESSION_KEY, "synthetic-other-tab");
    expect(invalidateStaffSession("synthetic-memory")).toBe(false);
    expect(getStaffSessionToken()).toBe("synthetic-other-tab");
  });
});

describe("staff session error classification", () => {
  const message = "A verified session is required. Please sign in again.";
  it("recognizes only the explicit rejection and its Convex query wrapper", () => {
    expect(isStaffSessionError(new Error(message))).toBe(true);
    expect(isStaffSessionError(new Error(`[CONVEX Q(queries/billing:getCompanySubscription)] Server Error\nUncaught Error: ${message}\n at handler`))).toBe(true);
    for (const error of [new Error("Access denied"), new Error("Super admin session required"), new Error("Session verification is unavailable"), new Error(`Unrelated: ${message}`), message]) {
      expect(isStaffSessionError(error)).toBe(false);
    }
  });
});
