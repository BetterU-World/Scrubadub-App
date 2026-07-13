import { describe, expect, it } from "vitest";
import { clearClientSession, CLIENT_SESSION_KEY, getClientSessionToken } from "../../../packages/frontend/src/lib/clientSession";

const LEGACY_CLIENT_USER_KEY = "scrubadub_clientUserId";

function storage(initial: Record<string, string>) {
  const values = new Map(Object.entries(initial));
  return { getItem: (key: string) => values.get(key) ?? null, removeItem: (key: string) => values.delete(key), has: (key: string) => values.has(key) };
}

describe("client session hydration", () => {
  it("skips protected client queries and clears a legacy-only identity", () => {
    const local = storage({ [LEGACY_CLIENT_USER_KEY]: "legacy-client" });
    expect(getClientSessionToken(local)).toBe("");
    expect(local.has(LEGACY_CLIENT_USER_KEY)).toBe(false);
  });

  it("retains only the verified client session token", () => {
    const local = storage({ [LEGACY_CLIENT_USER_KEY]: "forged-client", [CLIENT_SESSION_KEY]: "session" });
    expect(getClientSessionToken(local)).toBe("session");
    expect(local.has(LEGACY_CLIENT_USER_KEY)).toBe(false);
  });

  it("clears the client session and historical identity on logout", () => {
    const local = storage({ [LEGACY_CLIENT_USER_KEY]: "historical-client", [CLIENT_SESSION_KEY]: "session" });
    clearClientSession(local);
    expect(local.has(CLIENT_SESSION_KEY)).toBe(false);
    expect(local.has(LEGACY_CLIENT_USER_KEY)).toBe(false);
  });
});
