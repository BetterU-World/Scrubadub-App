export const CLIENT_SESSION_KEY = "scrubadub_clientSessionToken";
const LEGACY_CLIENT_USER_KEY = "scrubadub_clientUserId";

type ClientSessionStorage = Pick<Storage, "getItem" | "removeItem">;

export type ClientSessionSnapshot = Readonly<{
  token: string;
  revision: number;
}>;

const serverSnapshot: ClientSessionSnapshot = { token: "", revision: 0 };
let snapshot: ClientSessionSnapshot | undefined;
let memoryOnly = false;
const listeners = new Set<() => void>();

function browserStorage(): Storage | undefined {
  try { return typeof window === "undefined" ? undefined : window.localStorage; } catch { return undefined; }
}

function readStoredToken(storage: ClientSessionStorage): string {
  storage.removeItem(LEGACY_CLIENT_USER_KEY);
  return storage.getItem(CLIENT_SESSION_KEY) ?? "";
}

export function getClientSessionSnapshot(): ClientSessionSnapshot {
  if (!snapshot) {
    let token = "";
    try { const storage = browserStorage(); if (storage) token = readStoredToken(storage); } catch { /* unavailable storage */ }
    snapshot = { ...serverSnapshot, token };
  }
  return snapshot;
}

export function getServerClientSessionSnapshot(): ClientSessionSnapshot { return serverSnapshot; }

function publish(token: string): void {
  const current = getClientSessionSnapshot();
  if (current.token === token) return;
  snapshot = { token, revision: current.revision + 1 };
  for (const listener of Array.from(listeners)) listener();
}

function synchronizeFromStorage(): void {
  if (memoryOnly) return;
  try {
    const storage = browserStorage();
    if (!storage) return;
    const token = readStoredToken(storage);
    const current = getClientSessionSnapshot();
    if (token !== current.token) publish(token);
  } catch { /* Retain the in-memory session if storage is unavailable. */ }
}

function onStorage(event: StorageEvent): void {
  if ((event.key === CLIENT_SESSION_KEY || event.key === null) &&
      (!event.storageArea || event.storageArea === browserStorage())) {
    // Read current storage, not a potentially delayed event's old/new value.
    memoryOnly = false;
    synchronizeFromStorage();
  }
}

export function subscribeClientSession(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
    window.addEventListener("pageshow", synchronizeFromStorage);
  }
  // Also reconcile changes made while no React consumer was mounted.
  synchronizeFromStorage();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pageshow", synchronizeFromStorage);
    }
  };
}

/** Compatibility accessor for existing query/action callers; no render-time storage read. */
export function getClientSessionToken(storage?: ClientSessionStorage): string {
  return storage ? readStoredToken(storage) : getClientSessionSnapshot().token;
}

export function setClientSessionToken(token: string, expectedRevision?: number): boolean {
  if (expectedRevision !== undefined) {
    synchronizeFromStorage();
    if (getClientSessionSnapshot().revision !== expectedRevision) return false;
  }
  memoryOnly = false;
  try {
    const storage = browserStorage();
    if (!storage) memoryOnly = true;
    storage?.removeItem(LEGACY_CLIENT_USER_KEY);
    if (token) storage?.setItem(CLIENT_SESSION_KEY, token);
    else storage?.removeItem(CLIENT_SESSION_KEY);
  } catch { memoryOnly = true; /* Session remains usable in memory for this page. */ }
  publish(token);
  return true;
}

/** An old rejection must never remove a credential established by a newer login/tab. */
export function invalidateClientSession(rejectedToken: string): boolean {
  synchronizeFromStorage();
  if (!rejectedToken || getClientSessionSnapshot().token !== rejectedToken) return false;
  try {
    const storage = browserStorage();
    const stored = storage?.getItem(CLIENT_SESSION_KEY);
    if (stored && stored !== rejectedToken) {
      memoryOnly = false;
      publish(stored);
      return false;
    }
    storage?.removeItem(CLIENT_SESSION_KEY);
    storage?.removeItem(LEGACY_CLIENT_USER_KEY);
  } catch { /* Still stop subscriptions in this page. */ }
  publish("");
  return true;
}

export function clearClientSession(storage?: ClientSessionStorage): void {
  if (storage) {
    storage.removeItem(CLIENT_SESSION_KEY);
    storage.removeItem(LEGACY_CLIENT_USER_KEY);
  } else {
    setClientSessionToken("");
  }
}
