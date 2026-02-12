import { useState, useEffect, useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
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

  const signUpMutation = useMutation(api.auth.signUp);
  const signInMutation = useMutation(api.auth.signIn);
  const user = useQuery(api.auth.getCurrentUser, { userId: userId ?? undefined });

  useEffect(() => {
    if (user !== undefined) {
      setIsLoading(false);
      if (user === null && userId) {
        // User was deleted or invalid
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
      const result = await signUpMutation(args);
      localStorage.setItem(AUTH_KEY, JSON.stringify(result.userId));
      setUserId(result.userId);
      return result;
    },
    [signUpMutation]
  );

  const signIn = useCallback(
    async (args: { email: string; password: string }) => {
      const result = await signInMutation(args);
      localStorage.setItem(AUTH_KEY, JSON.stringify(result.userId));
      setUserId(result.userId as Id<"users">);
      return result;
    },
    [signInMutation]
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
