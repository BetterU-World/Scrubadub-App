import { useCallback, useEffect, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
  CLIENT_SESSION_KEY,
  CLIENT_USER_KEY,
  getClientSessionToken,
  getStoredClientUserId,
} from "@/lib/clientSession";

const CLIENT_STORAGE_KEY = CLIENT_USER_KEY;
export { CLIENT_SESSION_KEY, getClientSessionToken };

function storedClientUserId(): Id<"clientUsers"> | null {
  const stored = getStoredClientUserId();
  return stored ? (stored as Id<"clientUsers">) : null;
}

export function useClientAuth() {
  const [clientUserId, setClientUserId] = useState<Id<"clientUsers"> | null>(storedClientUserId);
  const sessionToken = getClientSessionToken();
  const signInAction = useAction(api.clientAuthActions.signIn);
  const revokeSession = useAction((api as any).sessionActions.revokeCurrent);
  const clientUser = useQuery(
    api.queries.clientAuth.getCurrentClientUser,
    clientUserId && sessionToken ? { clientUserId, sessionToken } : "skip"
  );
  const authenticatedClientUser = sessionToken ? clientUser : null;

  useEffect(() => {
    if (!sessionToken && clientUserId) {
      localStorage.removeItem(CLIENT_STORAGE_KEY);
      setClientUserId(null);
    }
  }, [clientUserId, sessionToken]);

  const signIn = useCallback(
    async (args: { email: string; password: string }) => {
      const result = await signInAction(args);
      localStorage.setItem(CLIENT_STORAGE_KEY, String(result.clientUserId));
      localStorage.setItem(CLIENT_SESSION_KEY, result.sessionToken);
      setClientUserId(result.clientUserId);
      return result;
    },
    [signInAction]
  );

  const setSignedInClient = useCallback((id: Id<"clientUsers">, sessionToken?: string) => {
    localStorage.setItem(CLIENT_STORAGE_KEY, String(id));
    if (sessionToken) localStorage.setItem(CLIENT_SESSION_KEY, sessionToken);
    setClientUserId(id);
  }, []);

  const signOut = useCallback(() => {
    const sessionToken = localStorage.getItem(CLIENT_SESSION_KEY);
    localStorage.removeItem(CLIENT_STORAGE_KEY);
    localStorage.removeItem(CLIENT_SESSION_KEY);
    setClientUserId(null);
    if (sessionToken) void revokeSession({ sessionToken }).catch(() => {});
    window.location.assign("/client/login");
  }, [revokeSession]);

  return {
    clientUser: authenticatedClientUser,
    clientUserId: sessionToken ? clientUserId : null,
    sessionToken,
    isLoading: Boolean(clientUserId && sessionToken && clientUser === undefined),
    isAuthenticated: Boolean(authenticatedClientUser),
    signIn,
    setSignedInClient,
    signOut,
  };
}
