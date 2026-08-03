import { useCallback, useEffect, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import {
  clearClientSession,
  CLIENT_SESSION_KEY,
  getClientSessionToken,
} from "../lib/clientSession";

export { CLIENT_SESSION_KEY, getClientSessionToken };

export function useClientAuth() {
  const [sessionToken, setSessionToken] = useState(getClientSessionToken);
  const signInAction = useAction(api.clientAuthActions.signIn);
  const revokeSession = useAction((api as any).sessionActions.revokeCurrent);
  const clientUser = useQuery(
    api.queries.clientAuth.getCurrentClientUser,
    sessionToken ? { sessionToken } : "skip"
  );
  const authenticatedClientUser = sessionToken ? clientUser : null;
  const clientUserId = authenticatedClientUser?._id ?? null;

  useEffect(() => {
    if (sessionToken && clientUser === null) {
      clearClientSession();
      setSessionToken("");
    }
  }, [clientUser, sessionToken]);

  const signIn = useCallback(
    async (args: { email: string; password: string }) => {
      const result = await signInAction(args);
      localStorage.setItem(CLIENT_SESSION_KEY, result.sessionToken);
      setSessionToken(result.sessionToken);
      return result;
    },
    [signInAction]
  );

  const setSignedInClient = useCallback((verifiedSessionToken: string) => {
    localStorage.setItem(CLIENT_SESSION_KEY, verifiedSessionToken);
    setSessionToken(verifiedSessionToken);
  }, []);

  const signOut = useCallback(() => {
    const tokenToRevoke = sessionToken;
    clearClientSession();
    setSessionToken("");
    if (tokenToRevoke) void revokeSession({ sessionToken: tokenToRevoke }).catch(() => {});
    window.location.assign("/client/login");
  }, [revokeSession, sessionToken]);

  return {
    clientUser: authenticatedClientUser,
    clientUserId,
    sessionToken,
    isLoading: Boolean(sessionToken && clientUser === undefined),
    isAuthenticated: Boolean(authenticatedClientUser),
    signIn,
    setSignedInClient,
    signOut,
  };
}
