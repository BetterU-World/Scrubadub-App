export const CLIENT_SESSION_KEY = "scrubadub_clientSessionToken";
const LEGACY_CLIENT_USER_KEY = "scrubadub_clientUserId";

type ClientSessionStorage = Pick<Storage, "getItem" | "removeItem">;

export function getClientSessionToken(storage: ClientSessionStorage = localStorage): string {
  storage.removeItem(LEGACY_CLIENT_USER_KEY);
  return storage.getItem(CLIENT_SESSION_KEY) ?? "";
}

export function clearClientSession(storage: ClientSessionStorage = localStorage): void {
  storage.removeItem(CLIENT_SESSION_KEY);
  storage.removeItem(LEGACY_CLIENT_USER_KEY);
}
