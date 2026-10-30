export const STAFF_SESSION_KEY = "scrubadub_staffSessionToken";
const LEGACY_STAFF_USER_KEY = "scrubadub_userId";

type StaffSessionStorage = Pick<Storage, "getItem" | "removeItem">;

export type StaffSessionSnapshot = Readonly<{
  token: string;
  revision: number;
  recoveryRequired: boolean;
}>;

const serverSnapshot: StaffSessionSnapshot = { token: "", revision: 0, recoveryRequired: false };
let snapshot: StaffSessionSnapshot | undefined;
let memoryOnly = false;
const listeners = new Set<() => void>();

function browserStorage(): Storage | undefined {
  try { return typeof window === "undefined" ? undefined : window.localStorage; } catch { return undefined; }
}

function readStoredToken(storage: StaffSessionStorage): string {
  storage.removeItem(LEGACY_STAFF_USER_KEY);
  return storage.getItem(STAFF_SESSION_KEY) ?? "";
}

export function getStaffSessionSnapshot(): StaffSessionSnapshot {
  if (!snapshot) {
    let token = "";
    try { const storage = browserStorage(); if (storage) token = readStoredToken(storage); } catch { /* unavailable storage */ }
    snapshot = { ...serverSnapshot, token };
  }
  return snapshot;
}

export function getServerStaffSessionSnapshot(): StaffSessionSnapshot { return serverSnapshot; }

function publish(token: string, recoveryRequired = false): void {
  const current = getStaffSessionSnapshot();
  if (current.token === token && current.recoveryRequired === recoveryRequired) return;
  snapshot = { token, recoveryRequired, revision: current.revision + 1 };
  for (const listener of Array.from(listeners)) listener();
}

function synchronizeFromStorage(): void {
  if (memoryOnly) return;
  try {
    const storage = browserStorage();
    if (!storage) return;
    const token = readStoredToken(storage);
    const current = getStaffSessionSnapshot();
    if (token !== current.token) publish(token, !token && !!current.token);
  } catch { /* Retain the in-memory session if storage is unavailable. */ }
}

function onStorage(event: StorageEvent): void {
  if ((event.key === STAFF_SESSION_KEY || event.key === null) &&
      (!event.storageArea || event.storageArea === browserStorage())) {
    // Read current storage, not a potentially delayed event's old/new value.
    memoryOnly = false;
    synchronizeFromStorage();
  }
}

export function subscribeStaffSession(listener: () => void): () => void {
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
export function getStaffSessionToken(storage?: StaffSessionStorage): string {
  return storage ? readStoredToken(storage) : getStaffSessionSnapshot().token;
}

export function setStaffSessionToken(token: string, expectedRevision?: number): boolean {
  if (expectedRevision !== undefined) {
    synchronizeFromStorage();
    if (getStaffSessionSnapshot().revision !== expectedRevision) return false;
  }
  memoryOnly = false;
  try {
    const storage = browserStorage();
    if (!storage) memoryOnly = true;
    storage?.removeItem(LEGACY_STAFF_USER_KEY);
    if (token) storage?.setItem(STAFF_SESSION_KEY, token);
    else storage?.removeItem(STAFF_SESSION_KEY);
  } catch { memoryOnly = true; /* Session remains usable in memory for this page. */ }
  publish(token);
  return true;
}

/** An old rejection must never remove a credential established by a newer login/tab. */
export function invalidateStaffSession(rejectedToken: string): boolean {
  synchronizeFromStorage();
  if (!rejectedToken || getStaffSessionSnapshot().token !== rejectedToken) return false;
  try {
    const storage = browserStorage();
    const stored = storage?.getItem(STAFF_SESSION_KEY);
    if (stored && stored !== rejectedToken) {
      memoryOnly = false;
      publish(stored);
      return false;
    }
    storage?.removeItem(STAFF_SESSION_KEY);
    storage?.removeItem(LEGACY_STAFF_USER_KEY);
  } catch { /* Still stop subscriptions in this page. */ }
  publish("", true);
  return true;
}

export function clearStaffSession(storage?: StaffSessionStorage): void {
  if (storage) {
    storage.removeItem(STAFF_SESSION_KEY);
    storage.removeItem(LEGACY_STAFF_USER_KEY);
  } else {
    setStaffSessionToken("");
  }
}
