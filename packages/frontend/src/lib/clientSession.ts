export const CLIENT_USER_KEY = "scrubadub_clientUserId";
export const CLIENT_SESSION_KEY = "scrubadub_clientSessionToken";

type ClientSessionStorage = Pick<Storage, "getItem" | "removeItem">;

export function getClientSessionToken(storage: ClientSessionStorage = localStorage): string {
  return storage.getItem(CLIENT_SESSION_KEY) ?? "";
}

export function getStoredClientUserId(storage: ClientSessionStorage = localStorage): string | null {
  const clientUserId = storage.getItem(CLIENT_USER_KEY);
  if (!clientUserId) return null;
  if (!getClientSessionToken(storage)) {
    storage.removeItem(CLIENT_USER_KEY);
    return null;
  }
  return clientUserId;
}
