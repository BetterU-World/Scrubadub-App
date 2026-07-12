export const STAFF_USER_KEY = "scrubadub_userId";
export const STAFF_SESSION_KEY = "scrubadub_staffSessionToken";

type StaffSessionStorage = Pick<Storage, "getItem" | "removeItem">;

export function getStaffSessionToken(storage: StaffSessionStorage = localStorage): string {
  return storage.getItem(STAFF_SESSION_KEY) ?? "";
}

export function getStoredStaffUserId(storage: StaffSessionStorage = localStorage): string | null {
  const userId = storage.getItem(STAFF_USER_KEY);
  if (!userId) return null;

  // A legacy ID is not an authenticated principal. Clear it before React can
  // hydrate protected queries with an empty session token.
  if (!getStaffSessionToken(storage)) {
    storage.removeItem(STAFF_USER_KEY);
    return null;
  }

  return userId;
}
