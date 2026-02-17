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
}

function getStoredUserId(): Id<"users"> | null {
  try {
    const stored = localStorage.getItem(AUTH_KEY);
    const parsed = stored ? (JSON.parse(stored) as Id<"users">) : null;
    console.log("[AUTH DEBUG] getStoredUserId: raw localStorage =", JSON.stringify(stored), "=> parsed =", parsed);
    return parsed;
  } catch (e) {
    console.log("[AUTH DEBUG] getStoredUserId: parse error", e);
    return null;
  }
}

export function useAuth() {
  const [userId, setUserId] = useState<Id<"users"> | null>(getStoredUserId);
  const [isLoading, setIsLoading] = useState(true);

  const signUpAction = useAction(api.authActions.signUp);
  const signInAction = useAction(api.authActions.signIn);
  const queryArg = { userId: userId ?? undefined };
  console.log("[AUTH DEBUG] useAuth render: userId state =", userId, "| queryArg =", JSON.stringify(queryArg));
  const user = useQuery(api.auth.getCurrentUser, queryArg);
  console.log("[AUTH DEBUG] useQuery(getCurrentUser) returned:", user, "| typeof:", typeof user);

  useEffect(() => {
    console.log("[AUTH DEBUG] useEffect: user =", user, "| userId =", userId, "| isLoading =", isLoading);
    if (user !== undefined) {
      setIsLoading(false);
      if (user === null && userId) {
        console.log("[AUTH DEBUG] CLEARING AUTH: getCurrentUser returned null for userId =", userId);
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
      console.log("[AUTH DEBUG] signIn result:", JSON.stringify(result));
      const serialized = JSON.stringify(result.userId);
      localStorage.setItem(AUTH_KEY, serialized);
      console.log("[AUTH DEBUG] signIn: wrote localStorage", AUTH_KEY, "=", serialized, "| readback =", localStorage.getItem(AUTH_KEY));
      setUserId(result.userId as Id<"users">);
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
