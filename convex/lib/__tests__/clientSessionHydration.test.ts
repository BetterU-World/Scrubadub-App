import { describe, expect, it } from "vitest";
import { CLIENT_SESSION_KEY, CLIENT_USER_KEY, getClientSessionToken, getStoredClientUserId } from "../../../packages/frontend/src/lib/clientSession";

function storage(initial: Record<string, string>) {
  const values = new Map(Object.entries(initial));
  return { getItem: (key: string) => values.get(key) ?? null, removeItem: (key: string) => values.delete(key), has: (key: string) => values.has(key) };
}

describe("client session hydration", () => {
  it("skips protected client queries and clears a legacy-only identity", () => {
    const local = storage({ [CLIENT_USER_KEY]: "legacy-client" });
    expect(getStoredClientUserId(local)).toBeNull();
    expect(getClientSessionToken(local)).toBe("");
    expect(local.has(CLIENT_USER_KEY)).toBe(false);
  });

  it("hydrates the verified client identity and token together", () => {
    const local = storage({ [CLIENT_USER_KEY]: "client", [CLIENT_SESSION_KEY]: "session" });
    expect(getStoredClientUserId(local)).toBe("client");
    expect(getClientSessionToken(local)).toBe("session");
  });
});
