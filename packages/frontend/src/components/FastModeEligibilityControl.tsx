import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { getStaffSessionToken, useAuth } from "@/hooks/useAuth";

export function FastModeEligibilityControl({ workerUserId, eligible }: {
  workerUserId: Id<"users">; eligible: boolean;
}) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const update = useMutation(api.mutations.workers.setFastModeEligibility);
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  if (!user || (user.role !== "owner" && !(user.role === "manager" && user.canManageTeam))) return null;
  async function change(value: boolean) {
    if (inFlight.current || !user) return;
    inFlight.current = true; setPending(true); setError(""); setSaved(false);
    try {
      await update({ workerUserId, eligible: value, userId: user._id, sessionToken: getStaffSessionToken() });
      setSaved(true);
    } catch { setError(t("fastMode.saveFailed")); }
    finally { inFlight.current = false; setPending(false); }
  }
  return <div className="mt-2 max-w-sm text-left text-sm">
    <label className="flex min-h-11 items-center gap-2">
      <input type="checkbox" checked={eligible} disabled={pending}
        onChange={event => void change(event.target.checked)} />
      <span>{t("fastMode.allow")}</span>
    </label>
    <p className="text-xs text-gray-500">{t("fastMode.eligibilityHelp")}</p>
    {pending && <p role="status">{t("common.saving")}</p>}
    {saved && <p role="status">{t("fastMode.saved")}</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </div>;
}
