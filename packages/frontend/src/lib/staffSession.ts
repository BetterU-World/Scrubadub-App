export const STAFF_SESSION_KEY = "scrubadub_staffSessionToken";
const LEGACY_STAFF_USER_KEY = "scrubadub_userId";

type StaffSessionStorage = Pick<Storage, "getItem" | "removeItem">;

export function getStaffSessionToken(storage: StaffSessionStorage = localStorage): string {
  storage.removeItem(LEGACY_STAFF_USER_KEY);
  return storage.getItem(STAFF_SESSION_KEY) ?? "";
}

export function clearStaffSession(storage: StaffSessionStorage = localStorage): void {
  storage.removeItem(STAFF_SESSION_KEY);
  storage.removeItem(LEGACY_STAFF_USER_KEY);
}
