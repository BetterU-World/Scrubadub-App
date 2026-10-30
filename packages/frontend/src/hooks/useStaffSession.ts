import { useSyncExternalStore } from "react";
import { getServerStaffSessionSnapshot, getStaffSessionSnapshot, subscribeStaffSession } from "@/lib/staffSession";

export function useStaffSession() {
  return useSyncExternalStore(subscribeStaffSession, getStaffSessionSnapshot, getServerStaffSessionSnapshot);
}
