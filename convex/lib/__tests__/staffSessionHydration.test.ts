import { describe, expect, it } from "vitest";
import {
  getStaffSessionToken,
  getStoredStaffUserId,
  STAFF_SESSION_KEY,
  STAFF_USER_KEY,
} from "../../../packages/frontend/src/lib/staffSession";

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
    const local = storage({ [STAFF_USER_KEY]: "legacy-worker-id" });

    expect(getStoredStaffUserId(local)).toBeNull();
    expect(getStaffSessionToken(local)).toBe("");
    expect(local.has(STAFF_USER_KEY)).toBe(false);
  });

  it("hydrates the same owner, manager, worker, and affiliate caller shape when a session exists", () => {
    const local = storage({
      [STAFF_USER_KEY]: "verified-user-id",
      [STAFF_SESSION_KEY]: "verified-session-token",
    });

    expect(getStoredStaffUserId(local)).toBe("verified-user-id");
    expect(getStaffSessionToken(local)).toBe("verified-session-token");
  });
});
