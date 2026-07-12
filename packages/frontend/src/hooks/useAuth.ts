import { useState, useEffect, useCallback, useRef } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import {
  getStaffSessionToken,
  getStoredStaffUserId,
  STAFF_SESSION_KEY,
  STAFF_USER_KEY,
} from "@/lib/staffSession";

const STORAGE_KEY = STAFF_USER_KEY;
const REF_KEY = "scrubadub_ref";
// Temporary Security V2 migration credential. This remains in localStorage only
// until the app adopts provider-backed transport or a same-origin cookie layer.
export { getStaffSessionToken, STAFF_SESSION_KEY };

interface AuthUser {
  _id: Id<"users">;
  email: string;
  name: string;
  role: "owner" | "cleaner" | "maintenance" | "manager" | "affiliate";
  companyId?: Id<"companies">;
  companyName: string;
  status: string;
  phone?: string;
  referralCode?: string;
  referredByCode?: string;
  isSuperadmin?: boolean;
  // Manager permission flags
  canSeeAllJobs?: boolean;
  canCreateJobs?: boolean;
  canAssignCleaners?: boolean;
  canRequestRework?: boolean;
  canApproveForms?: boolean;
  canManageSchedule?: boolean;
  canResolveRedFlags?: boolean;
}

function getStoredUserId(): Id<"users"> | null {
  const stored = getStoredStaffUserId();
  return stored ? (stored as Id<"users">) : null;
}

export function useAuth() {
  const [userId, setUserId] = useState<Id<"users"> | null>(getStoredUserId);
  const [isLoading, setIsLoading] = useState(true);

  // ✅ Convex Actions
  const signUpAction = useAction(api.authActions.signUp);
  const signInAction = useAction(api.authActions.signIn);
  const revokeSession = useAction((api as any).sessionActions.revokeCurrent);
  const setReferredByCode = useMutation(api.mutations.affiliate.setReferredByCode);

  // ✅ Query current user
  const user = useQuery(api.authQueries.getCurrentUser, {
    userId: userId ?? undefined,
  });
  const sessionToken = getStaffSessionToken();
  const authenticatedUser = sessionToken ? user : null;

  useEffect(() => {
    if (!sessionToken && userId) {
      localStorage.removeItem(STORAGE_KEY);
      setUserId(null);
      setIsLoading(false);
      return;
    }
    if (user !== undefined) {
      setIsLoading(false);

      if (user === null && userId) {
        localStorage.removeItem(STORAGE_KEY);
        setUserId(null);
      }
    }
  }, [user, userId, sessionToken]);

  // ✅ Referral capture: if localStorage has a ref code, attribute it once
  const refApplied = useRef(false);
  useEffect(() => {
    if (refApplied.current) return;
    if (!authenticatedUser || !userId) return;
    if (authenticatedUser.referredByCode) {
      // Already attributed — clean up any stale key
      localStorage.removeItem(REF_KEY);
      refApplied.current = true;
      return;
    }
    const refCode = localStorage.getItem(REF_KEY);
    if (!refCode) return;
    refApplied.current = true;
    setReferredByCode({ userId, sessionToken: getStaffSessionToken(), refCode })
      .catch(() => {})
      .finally(() => localStorage.removeItem(REF_KEY));
  }, [authenticatedUser, userId, setReferredByCode]);

  const signUp = useCallback(
    async (args: {
      email: string;
      password: string;
      name: string;
      companyName: string;
    }) => {
      const result = await signUpAction(args);
      localStorage.setItem(STORAGE_KEY, String(result.userId));
      localStorage.setItem(STAFF_SESSION_KEY, result.sessionToken);
      setUserId(result.userId);
      return result;
    },
    [signUpAction]
  );

  const signIn = useCallback(
    async (args: { email: string; password: string }) => {
      const result = await signInAction(args);
      const uid = String(result.userId);
      localStorage.setItem(STORAGE_KEY, uid);
      localStorage.setItem(STAFF_SESSION_KEY, result.sessionToken);
      setUserId(uid as Id<"users">);
      return result;
    },
    [signInAction]
  );

  const signOut = useCallback(() => {
    const sessionToken = localStorage.getItem(STAFF_SESSION_KEY);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STAFF_SESSION_KEY);
    setUserId(null);
    if (sessionToken) void revokeSession({ sessionToken }).catch(() => {});
    window.location.assign("/login");
  }, [revokeSession]);

  return {
    user: authenticatedUser as AuthUser | null | undefined,
    userId,
    sessionToken,
    isLoading,
    isAuthenticated: !!authenticatedUser,
    signUp,
    signIn,
    signOut,
  };
}
