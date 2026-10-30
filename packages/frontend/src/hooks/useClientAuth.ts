import { useCallback, useEffect } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import {
  CLIENT_SESSION_KEY,
  getClientSessionSnapshot,
  getClientSessionToken,
  invalidateClientSession,
  setClientSessionToken,
} from "../lib/clientSession";
import { useClientSession } from "./useClientSession";

export { CLIENT_SESSION_KEY, getClientSessionToken };

export function useClientAuth() {
  const { token: sessionToken } = useClientSession();
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
      invalidateClientSession(sessionToken);
    }
  }, [clientUser, sessionToken]);

  const signIn = useCallback(
    async (args: { email: string; password: string }) => {
      const sessionRevision = getClientSessionSnapshot().revision;
      const result = await signInAction(args);
      setClientSessionToken(result.sessionToken, sessionRevision);
      return result;
    },
    [signInAction]
  );

  const setSignedInClient = useCallback((verifiedSessionToken: string, expectedRevision?: number) => {
    return setClientSessionToken(verifiedSessionToken, expectedRevision);
  }, []);

  const signOut = useCallback(() => {
    const tokenToRevoke = sessionToken;
    invalidateClientSession(tokenToRevoke);
    if (tokenToRevoke) void revokeSession({ sessionToken: tokenToRevoke }).catch(() => {});
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
