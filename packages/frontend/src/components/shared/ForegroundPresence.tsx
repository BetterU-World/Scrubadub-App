import { useEffect } from "react";
import { useMutation } from "convex/react";
import { useLocation } from "wouter";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { startForegroundPresence } from "@/lib/foregroundPresence";

/** Mounted only after a verified staff application screen renders. No polling or reconnect listener. */
export function ForegroundPresence() {
  const { user, sessionToken } = useAuth();
  const [path] = useLocation();
  const observe = useMutation(api.adminPresence.observe);
  const userId = user?._id,
    companyId = user?.companyId,
    role = user?.role;
  useEffect(() => {
    if (!userId || !companyId || !role || !sessionToken) return;
    // Include role/company so a legitimate reassignment isn't hidden by a previous tab's throttle.
    const accountKey = `${userId}:${companyId}:${role}`;
    const fallbackStorage = { getItem: () => null, setItem: () => {} };
    let storage: Pick<Storage, "getItem" | "setItem"> = fallbackStorage;
    try {
      storage = window.localStorage;
    } catch {
      /* Private browsing fallback. */
    }
    const recorder = startForegroundPresence({
      path,
      role,
      accountKey,
      storage,
      visible: () => document.visibilityState === "visible",
      observe: () => observe({ sessionToken, surface: "staff_app" }),
      lock: navigator.locks
        ? (work) =>
            navigator.locks.request(`scrub-presence:${accountKey}`, work)
        : undefined,
    });
    const record = () => {
      void recorder.record().catch(() => {
        /* Analytics failure must not block app access. */
      });
    };
    record();
    document.addEventListener("visibilitychange", record);
    return () => {
      recorder.dispose();
      document.removeEventListener("visibilitychange", record);
    };
  }, [path, role, userId, companyId, sessionToken, observe]);
  return null;
}
