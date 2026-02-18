import {
  useState,
  useEffect,
  useCallback,
  createContext,
  useContext,
  type ReactNode,
} from "react";
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

interface AuthContextValue {
  user: AuthUser | null | undefined;
  userId: Id<"users"> | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signUp: (args: {
    email: string;
    password: string;
    name: string;
    companyName: string;
  }) => Promise<{ userId: Id<"users"> }>;
  signIn: (args: {
    email: string;
    password: string;
  }) => Promise<{ userId: Id<"users"> }>;
  signOut: () => void;
}

function getStoredUserId(): Id<"users"> | null {
  try {
    const stored = localStorage.getItem(AUTH_KEY);
    return stored ? (JSON.parse(stored) as Id<"users">) : null;
  } catch {
    return null;
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<Id<"users"> | null>(getStoredUserId);
  const [isLoading, setIsLoading] = useState(true);

  const signUpAction = useAction(api.authActions.signUp);
  const signInAction = useAction(api.authActions.signIn);
  const user = useQuery(
    api.auth.getCurrentUser,
    userId ? { userId } : "skip",
  );

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }
    if (user !== undefined) {
      setIsLoading(false);
      if (user === null) {
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
      setIsLoading(true);
      setUserId(result.userId);
      return result;
    },
    [signUpAction],
  );

  const signIn = useCallback(
    async (args: { email: string; password: string }) => {
      const result = await signInAction(args);
      localStorage.setItem(AUTH_KEY, JSON.stringify(result.userId));
      setIsLoading(true);
      setUserId(result.userId as Id<"users">);
      return result;
    },
    [signInAction],
  );

  const signOut = useCallback(() => {
    localStorage.removeItem(AUTH_KEY);
    setUserId(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user: user as AuthUser | null | undefined,
        userId,
        isLoading,
        isAuthenticated: !!user,
        signUp,
        signIn,
        signOut,
      }}
    >
      {children}
      {import.meta.env.DEV && (
        <div
          style={{
            position: "fixed",
            bottom: 4,
            left: 4,
            padding: "4px 8px",
            background: "rgba(0,0,0,0.85)",
            color: "#0f0",
            fontSize: 11,
            fontFamily: "monospace",
            borderRadius: 4,
            zIndex: 99999,
            pointerEvents: "none",
          }}
        >
          uid:{userId ? "yes" : "no"} | loading:{String(isLoading)} | user:
          {user === undefined ? "undef" : user === null ? "null" : "obj"}
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
