import { useState, useEffect, useCallback } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

const AUTH_KEY = "scrubadub_auth";

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
  try {
    const stored = localStorage.getItem(AUTH_KEY);
    return stored ? (JSON.parse(stored) as Id<"users">) : null;
  } catch {
    return null;
  }
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
        localStorage.removeItem(AUTH_KEY);
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
      localStorage.setItem(AUTH_KEY, JSON.stringify(result.userId));
      setUserId(result.userId);
      return result;
    },
    [signUpAction]
  );

  const signIn = useCallback(
    async (args: { email: string; password: string }) => {
      const result = await signInAction(args);
      localStorage.setItem(AUTH_KEY, JSON.stringify(result.userId));
      setUserId(result.userId);
      return result;
    },
    [signInAction]
  );

  const signOut = useCallback(() => {
    localStorage.removeItem(AUTH_KEY);
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