import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DialogShell } from "@/components/ui/DialogShell";

export const JOB_CANCEL_REASONS = [
  "client_cancelled", "weather", "property_unavailable", "staff_unavailable",
  "duplicate_booking", "scheduling_conflict", "pricing_disagreement", "safety_concern", "other",
] as const;

export type JobCancelReason = (typeof JOB_CANCEL_REASONS)[number];

export function CancelJobDialog({ open, onOpenChange, onConfirm }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: JobCancelReason, notes?: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<JobCancelReason | "">("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const needsNotes = reason === "other";
  const valid = Boolean(reason) && (!needsNotes || Boolean(notes.trim()));

  const close = (next: boolean) => {
    if (!next) { setReason(""); setNotes(""); }
    onOpenChange(next);
  };

  return (
    <DialogShell
      open={open}
      onOpenChange={close}
      pending={pending}
      title={t("jobs.cancelJob")}
      description={t("jobs.cancelJobExplanation")}
      footer={<>
        <button type="button" className="btn-secondary" onClick={() => close(false)} disabled={pending}>{t("common.cancel")}</button>
        <button type="button" className="btn-danger" disabled={!valid || pending} onClick={async () => {
          if (!reason || !valid) return;
          setPending(true);
          try { await onConfirm(reason, notes.trim() || undefined); close(false); }
          finally { setPending(false); }
        }}>{pending ? t("common.saving") : t("jobs.cancelJob")}</button>
      </>}
    >
      <div className="space-y-4">
        <label className="block text-sm font-medium text-gray-700">
          {t("jobs.cancelReason")} <span className="text-red-600">*</span>
          <select className="input-field mt-1" value={reason} onChange={(event) => setReason(event.target.value as JobCancelReason)}>
            <option value="">{t("jobs.selectCancelReason")}</option>
            {JOB_CANCEL_REASONS.map((value) => <option key={value} value={value}>{t(`jobs.cancelReasons.${value}`)}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-gray-700">
          {t("jobs.cancelNotes")} {needsNotes ? <span className="text-red-600">*</span> : <span className="font-normal text-gray-500">({t("jobs.optional")})</span>}
          <textarea className="input-field mt-1" rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
      </div>
    </DialogShell>
  );
}
