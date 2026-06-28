import { useCallback, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

const CLIENT_STORAGE_KEY = "scrubadub_clientUserId";

function storedClientUserId(): Id<"clientUsers"> | null {
  const stored = localStorage.getItem(CLIENT_STORAGE_KEY);
  return stored ? (stored as Id<"clientUsers">) : null;
}

export function useClientAuth() {
  const [clientUserId, setClientUserId] = useState<Id<"clientUsers"> | null>(storedClientUserId);
  const signInAction = useAction(api.clientAuthActions.signIn);
  const clientUser = useQuery(
    api.queries.clientAuth.getCurrentClientUser,
    { clientUserId: clientUserId ?? undefined }
  );

  const signIn = useCallback(
    async (args: { email: string; password: string }) => {
      const result = await signInAction(args);
      localStorage.setItem(CLIENT_STORAGE_KEY, String(result.clientUserId));
      setClientUserId(result.clientUserId);
      return result;
    },
    [signInAction]
  );

  const setSignedInClient = useCallback((id: Id<"clientUsers">) => {
    localStorage.setItem(CLIENT_STORAGE_KEY, String(id));
    setClientUserId(id);
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(CLIENT_STORAGE_KEY);
    setClientUserId(null);
    window.location.assign("/client/login");
  }, []);

  return {
    clientUser,
    clientUserId,
    isLoading: clientUser === undefined,
    isAuthenticated: Boolean(clientUser),
    signIn,
    setSignedInClient,
    signOut,
  };
}
