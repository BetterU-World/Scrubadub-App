// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLIENT_SESSION_KEY, clearClientSession, getClientSessionSnapshot, getClientSessionToken,
  invalidateClientSession, setClientSessionToken, subscribeClientSession,
} from "./clientSession";
import { isClientSessionError } from "./clientSessionError";

let unsubscribe: (() => void) | undefined;
beforeEach(() => { localStorage.clear(); setClientSessionToken(""); });
afterEach(() => { unsubscribe?.(); unsubscribe = undefined; vi.restoreAllMocks(); });

function externalChange(value: string | null, eventValue = value) {
  if (value === null) localStorage.removeItem(CLIENT_SESSION_KEY);
  else localStorage.setItem(CLIENT_SESSION_KEY, value);
  window.dispatchEvent(new StorageEvent("storage", { key: CLIENT_SESSION_KEY, newValue: eventValue, storageArea: localStorage }));
}

describe("shared client session store", () => {
  it("publishes same-tab changes and supplies the same credential to legacy callers", () => {
    const listener = vi.fn(); unsubscribe = subscribeClientSession(listener);
    setClientSessionToken("synthetic-a");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getClientSessionSnapshot().token).toBe("synthetic-a");
    expect(getClientSessionToken()).toBe("synthetic-a");
    clearClientSession();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(getClientSessionToken()).toBe("");
  });

  it("does not reread storage when snapshots/accessors are read during render", () => {
    setClientSessionToken("synthetic-a");
    const read = vi.spyOn(Storage.prototype, "getItem");
    const first = getClientSessionSnapshot();
    expect(getClientSessionSnapshot()).toBe(first);
    expect(getClientSessionToken()).toBe(first.token);
    expect(read).not.toHaveBeenCalled();
  });

  it("synchronizes cross-tab replacement and logout", () => {
    unsubscribe = subscribeClientSession(vi.fn());
    setClientSessionToken("synthetic-a");
    externalChange("synthetic-b");
    expect(getClientSessionToken()).toBe("synthetic-b");
    externalChange(null);
    expect(getClientSessionSnapshot()).toMatchObject({ token: "" });
  });

  it("ignores delayed event contents and unrelated/staff storage changes", () => {
    unsubscribe = subscribeClientSession(vi.fn());
    setClientSessionToken("synthetic-a");
    externalChange("synthetic-new", "synthetic-old");
    expect(getClientSessionToken()).toBe("synthetic-new");
    window.dispatchEvent(new StorageEvent("storage", { key: "scrubadub_staffSessionToken", newValue: "staff" }));
    expect(getClientSessionToken()).toBe("synthetic-new");
  });

  it("handles localStorage.clear events and changes made while unsubscribed", () => {
    setClientSessionToken("synthetic-a");
    unsubscribe = subscribeClientSession(vi.fn());
    localStorage.clear();
    window.dispatchEvent(new StorageEvent("storage", { key: null, storageArea: localStorage }));
    expect(getClientSessionToken()).toBe("");
    unsubscribe();
    localStorage.setItem(CLIENT_SESSION_KEY, "synthetic-b");
    unsubscribe = subscribeClientSession(vi.fn());
    expect(getClientSessionToken()).toBe("synthetic-b");
  });

  it("conditionally clears the rejected credential once", () => {
    setClientSessionToken("synthetic-a");
    expect(invalidateClientSession("synthetic-a")).toBe(true);
    const revision = getClientSessionSnapshot().revision;
    expect(invalidateClientSession("synthetic-a")).toBe(false);
    expect(getClientSessionSnapshot().revision).toBe(revision);
    expect(localStorage.getItem(CLIENT_SESSION_KEY)).toBeNull();
  });

  it("cannot clear a newer same-tab login or a replacement before its storage event arrives", () => {
    setClientSessionToken("synthetic-new");
    expect(invalidateClientSession("synthetic-old")).toBe(false);
    localStorage.setItem(CLIENT_SESSION_KEY, "synthetic-other-tab");
    expect(invalidateClientSession("synthetic-new")).toBe(false);
    expect(getClientSessionToken()).toBe("synthetic-other-tab");
    expect(localStorage.getItem(CLIENT_SESSION_KEY)).toBe("synthetic-other-tab");
  });

  it("does not install a late authentication response over a newer session", () => {
    const revision = getClientSessionSnapshot().revision;
    setClientSessionToken("synthetic-new");
    expect(setClientSessionToken("synthetic-late-response", revision)).toBe(false);
    expect(getClientSessionToken()).toBe("synthetic-new");
  });

  it("retains a usable in-memory credential when browser storage writes are unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw Error("Storage unavailable"); });
    setClientSessionToken("synthetic-a");
    unsubscribe = subscribeClientSession(vi.fn());
    expect(getClientSessionToken()).toBe("synthetic-a");
    expect(invalidateClientSession("synthetic-a")).toBe(true);
    expect(getClientSessionToken()).toBe("");
  });

  it("protects a new persisted credential even after falling back to memory-only storage", () => {
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw Error("Storage unavailable"); });
    setClientSessionToken("synthetic-memory");
    write.mockRestore();
    localStorage.setItem(CLIENT_SESSION_KEY, "synthetic-other-tab");
    expect(invalidateClientSession("synthetic-memory")).toBe(false);
    expect(getClientSessionToken()).toBe("synthetic-other-tab");
  });
});

describe("client session error classification", () => {
  const message = "A verified session is required. Please sign in again.";
  it("recognizes only the explicit rejection and its Convex query wrapper", () => {
    expect(isClientSessionError(new Error(message))).toBe(true);
    expect(isClientSessionError(new Error(`[CONVEX Q(queries/billing:getCompanySubscription)] Server Error\nUncaught Error: ${message}\n at handler`))).toBe(true);
    for (const error of [new Error("Access denied"), new Error("Super admin session required"), new Error("Session verification is unavailable"), new Error(`Unrelated: ${message}`), message]) {
      expect(isClientSessionError(error)).toBe(false);
    }
  });
});
