import { useState, useEffect, useCallback } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

const STORAGE_KEY = "scrubadub_userId";

interface AuthUser {
  _id: Id<"users">;
  email: string;
  name: string;
  role: "owner" | "cleaner";
  companyId: Id<"companies">;
  companyName: string;
  status: string;
  phone?: string;
  isSuperadmin?: boolean;
}

function getStoredUserId(): Id<"users"> | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? (stored as Id<"users">) : null;
}

export function useAuth() {
  const [userId, setUserId] = useState<Id<"users"> | null>(getStoredUserId);
  const [isLoading, setIsLoading] = useState(true);

  // ✅ Convex Actions
  const signUpAction = useAction(api.authActions.signUp);
  const signInAction = useAction(api.authActions.signIn);

  // ✅ Query current user
  const user = useQuery(api.authQueries.getCurrentUser, {
    userId: userId ?? undefined,
  });

  useEffect(() => {
    if (user !== undefined) {
      setIsLoading(false);

      if (user === null && userId) {
        localStorage.removeItem(STORAGE_KEY);
        setUserId(null);
      }
    }
  }, [user, userId]);

  const signUp = useCallback(
    async (args: {
      email: string;
      password: string;
      name: string;
      companyName: string;
    }) => {
      const result = await signUpAction(args);
      localStorage.setItem(STORAGE_KEY, String(result.userId));
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
      console.log("[useAuth] stored userId", uid);
      setUserId(uid as Id<"users">);
      return result;
    },
    [signInAction]
  );

  const signOut = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUserId(null);
  }, []);

  return {
    user: user as AuthUser | null | undefined,
    userId,
    isLoading,
    isAuthenticated: !!user,
    signUp,
    signIn,
    signOut,
  };
}