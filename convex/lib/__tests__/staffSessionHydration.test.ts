import { describe, expect, it } from "vitest";
import {
  clearStaffSession,
  getStaffSessionToken,
  STAFF_SESSION_KEY,
} from "../../../packages/frontend/src/lib/staffSession";

const LEGACY_STAFF_USER_KEY = "scrubadub_userId";

function storage(initial: Record<string, string>) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    has: (key: string) => values.has(key),
  };
}

describe("staff session hydration", () => {
  it("does not hydrate protected query callers from a legacy ID without a session", () => {
    const local = storage({ [LEGACY_STAFF_USER_KEY]: "legacy-worker-id" });

    expect(getStaffSessionToken(local)).toBe("");
    expect(local.has(LEGACY_STAFF_USER_KEY)).toBe(false);
  });

  it("retains only the verified session and removes a historical identity key", () => {
    const local = storage({
      [LEGACY_STAFF_USER_KEY]: "forged-user-id",
      [STAFF_SESSION_KEY]: "verified-session-token",
    });

    expect(getStaffSessionToken(local)).toBe("verified-session-token");
    expect(local.has(LEGACY_STAFF_USER_KEY)).toBe(false);
  });

  it("clears the session and historical identity on logout", () => {
    const local = storage({
      [LEGACY_STAFF_USER_KEY]: "historical-user-id",
      [STAFF_SESSION_KEY]: "verified-session-token",
    });
    clearStaffSession(local);
    expect(local.has(STAFF_SESSION_KEY)).toBe(false);
    expect(local.has(LEGACY_STAFF_USER_KEY)).toBe(false);
  });
});
