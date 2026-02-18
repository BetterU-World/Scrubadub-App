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

function getStoredSessionToken(): string | null {
  try {
    const stored = localStorage.getItem(AUTH_KEY);
    if (!stored) return null;
    // Handle migration: old format stored JSON-stringified userId
    // New format stores plain sessionToken string (64-char hex)
    if (stored.startsWith('"')) {
      // Old format - clear it
      localStorage.removeItem(AUTH_KEY);
      return null;
    }
    return stored;
  } catch {
    return null;
  }
}

export function useAuth() {
  const [sessionToken, setSessionToken] = useState<string | null>(getStoredSessionToken);
  const [isLoading, setIsLoading] = useState(true);

  const signUpAction = useAction(api.authActions.signUp);
  const signInAction = useAction(api.authActions.signIn);
  const signOutAction = useAction(api.authActions.signOut);

  const user = useQuery(
    api.auth.getCurrentUser,
    { sessionToken: sessionToken ?? undefined }
  );

  useEffect(() => {
    if (user !== undefined) {
      setIsLoading(false);
      if (user === null && sessionToken) {
        // Session expired or invalid
        localStorage.removeItem(AUTH_KEY);
        setSessionToken(null);
      }
    }
  }, [user, sessionToken]);

  const signUp = useCallback(
    async (args: {
      email: string;
      password: string;
      name: string;
      companyName: string;
    }) => {
      const result = await signUpAction(args);
      localStorage.setItem(AUTH_KEY, result.sessionToken);
      setSessionToken(result.sessionToken);
      return result;
    },
    [signUpAction]
  );

  const signIn = useCallback(
    async (args: { email: string; password: string }) => {
      const result = await signInAction(args);
      localStorage.setItem(AUTH_KEY, result.sessionToken);
      setSessionToken(result.sessionToken);
      return result;
    },
    [signInAction]
  );

  const signOut = useCallback(async () => {
    if (sessionToken) {
      try {
        await signOutAction({ sessionToken });
      } catch {
        // Ignore errors during signout (e.g. session already expired)
      }
    }
    localStorage.removeItem(AUTH_KEY);
    setSessionToken(null);
  }, [sessionToken, signOutAction]);

  // Set session from external flows (e.g. invite acceptance) without full reload
  const setSession = useCallback((token: string) => {
    localStorage.setItem(AUTH_KEY, token);
    setSessionToken(token);
  }, []);

  return {
    user: user as AuthUser | null | undefined,
    sessionToken,
    isLoading,
    isAuthenticated: !!user,
    signUp,
    signIn,
    signOut,
    setSession,
  };
}
