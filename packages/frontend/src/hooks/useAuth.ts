import { useState, useEffect, useCallback, useRef } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import {
  clearStaffSession,
  getStaffSessionToken,
  STAFF_SESSION_KEY,
} from "@/lib/staffSession";

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
  canManageBusinessConfiguration?: boolean;
}

export function useAuth() {
  const [sessionToken, setSessionToken] = useState(getStaffSessionToken);

  // ✅ Convex Actions
  const signUpAction = useAction(api.authActions.signUp);
  const signInAction = useAction(api.authActions.signIn);
  const revokeSession = useAction((api as any).sessionActions.revokeCurrent);
  const setReferredByCode = useMutation(api.mutations.affiliate.setReferredByCode);

  // ✅ Query current user
  const user = useQuery(
    api.authQueries.getCurrentUser,
    sessionToken ? { sessionToken } : "skip"
  );
  const authenticatedUser = sessionToken ? user : null;
  const userId = authenticatedUser?._id ?? null;
  const isLoading = Boolean(sessionToken && user === undefined);

  useEffect(() => {
    if (sessionToken && user === null) {
      clearStaffSession();
      setSessionToken("");
    }
  }, [user, sessionToken]);

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
      localStorage.setItem(STAFF_SESSION_KEY, result.sessionToken);
      setSessionToken(result.sessionToken);
      return result;
    },
    [signUpAction]
  );

  const signIn = useCallback(
    async (args: { email: string; password: string }) => {
      const result = await signInAction(args);
      localStorage.setItem(STAFF_SESSION_KEY, result.sessionToken);
      setSessionToken(result.sessionToken);
      return result;
    },
    [signInAction]
  );

  const signOut = useCallback(() => {
    const tokenToRevoke = sessionToken;
    clearStaffSession();
    setSessionToken("");
    if (tokenToRevoke) void revokeSession({ sessionToken: tokenToRevoke }).catch(() => {});
    window.location.assign("/login");
  }, [revokeSession, sessionToken]);

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
