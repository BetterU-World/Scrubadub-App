import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { getStaffSessionToken, useAuth } from "@/hooks/useAuth";
import { AsyncButton } from "./ui/AsyncButton";

export function FastModeSectionButton({ formId, section, complete }: {
  formId: Id<"forms">; section: string; complete: boolean;
}) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const confirm = useMutation(api.mutations.forms.confirmSection);
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit() {
    if (inFlight.current || complete || !user) return;
    inFlight.current = true; setPending(true); setError(""); setMessage("");
    try {
      await confirm({ formId, section, userId: user._id, sessionToken: getStaffSessionToken() });
      setMessage(t("fastMode.confirmed", { section }));
    } catch (err) {
      setError(t(err instanceof Error && err.message.includes("Fast Mode eligibility required")
        ? "fastMode.unavailable" : "fastMode.confirmFailed"));
    } finally { inFlight.current = false; setPending(false); }
  }
  return <div className="mt-3 space-y-2">
    <AsyncButton onClick={submit} pending={pending} disabled={complete}
      pendingLabel={t("fastMode.confirming")} className="btn-secondary touch-target w-full">
      {t(complete ? "fastMode.sectionComplete" : "fastMode.confirmSection", { section })}
    </AsyncButton>
    {message && <p role="status" className="text-sm text-green-700">{message}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
