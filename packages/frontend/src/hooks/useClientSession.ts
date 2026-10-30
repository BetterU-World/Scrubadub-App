import { useSyncExternalStore } from "react";
import { getClientSessionSnapshot, getServerClientSessionSnapshot, subscribeClientSession } from "@/lib/clientSession";

export function useClientSession() {
  return useSyncExternalStore(subscribeClientSession, getClientSessionSnapshot, getServerClientSessionSnapshot);
}
