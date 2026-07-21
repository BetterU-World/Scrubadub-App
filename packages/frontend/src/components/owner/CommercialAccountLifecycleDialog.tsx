import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { DialogShell } from "@/components/ui/DialogShell";
import { useTranslation } from "react-i18next";

type Action = "pause" | "resume" | "end";
const PAUSE_REASONS = ["client_request", "seasonal_pause", "property_unavailable", "payment_issue", "staffing_issue", "contract_review", "safety_concern", "other"];
const END_REASONS = ["client_terminated", "company_terminated", "contract_completed", "nonpayment", "pricing_disagreement", "service_quality_issue", "property_closed", "safety_concern", "other"];

export function CommercialAccountLifecycleDialog({ action, accountId, futureJobCount, open, onOpenChange, onSuccess }: {
  action: Action; accountId: Id<"commercialAccounts">; futureJobCount: number; open: boolean;
  onOpenChange: (open: boolean) => void; onSuccess: (message: string) => void;
}) {
  const { user, sessionToken } = useAuth();
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const pause = useMutation((api as any).mutations.commercialAccounts.pauseCommercialAccount);
  const resume = useMutation((api as any).mutations.commercialAccounts.resumeCommercialAccount);
  const end = useMutation((api as any).mutations.commercialAccounts.endCommercialAccount);
  const reasons = action === "pause" ? PAUSE_REASONS : END_REASONS;

  const submit = async () => {
    if (!user) return;
    if (action !== "resume" && !reason) return setError(t("commercialAccounts.lifecycle.validation.reason"));
    if (reason === "other" && !notes.trim()) return setError(t("commercialAccounts.lifecycle.validation.otherNotes"));
    setPending(true); setError("");
    try {
      const common = { commercialAccountId: accountId, userId: user._id, sessionToken, notes: notes.trim() || undefined };
      if (action === "pause") await pause({ ...common, reason, effectiveDate: effectiveDate || undefined });
      else if (action === "resume") await resume(common);
      else await end({ ...common, reason, effectiveDate: effectiveDate || undefined });
      onOpenChange(false);
      onSuccess(t(`commercialAccounts.lifecycle.${action}.success`));
      setReason(""); setNotes(""); setEffectiveDate("");
    } catch (err: any) {
      setError(err.message || t("commercialAccounts.lifecycle.error"));
    } finally { setPending(false); }
  };

  return <DialogShell open={open} onOpenChange={onOpenChange} pending={pending}
    title={t(`commercialAccounts.lifecycle.${action}.title`)}
    description={t(`commercialAccounts.lifecycle.${action}.description`)}
    footer={<><button type="button" className="btn-secondary" disabled={pending} onClick={() => onOpenChange(false)}>{t("common.cancel")}</button><button type="button" className={action === "end" ? "btn-danger" : "btn-primary"} disabled={pending} onClick={submit}>{pending ? t("common.saving") : t(`commercialAccounts.lifecycle.${action}.confirm`)}</button></>}>
    <div className="space-y-4">
      {action !== "resume" && <label className="block"><span className="text-sm font-medium text-gray-700">{t("commercialAccounts.lifecycle.reason")}</span><select className="input-field mt-1" value={reason} onChange={(e) => setReason(e.target.value)}><option value="">{t("common.select")}</option>{reasons.map((value) => <option key={value} value={value}>{t(`commercialAccounts.lifecycle.reasons.${value}`)}</option>)}</select></label>}
      {action !== "resume" && <label className="block"><span className="text-sm font-medium text-gray-700">{t("commercialAccounts.lifecycle.effectiveDate")}</span><input type="date" className="input-field mt-1" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} /></label>}
      <label className="block"><span className="text-sm font-medium text-gray-700">{t("commercialAccounts.lifecycle.notes")}</span><textarea className="input-field mt-1" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      {action !== "resume" && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p className="font-medium">{t("commercialAccounts.lifecycle.futureJobs", { count: futureJobCount })}</p><p className="mt-1">{t("commercialAccounts.lifecycle.futureJobsUnchanged")}</p></div>}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </div>
  </DialogShell>;
}
