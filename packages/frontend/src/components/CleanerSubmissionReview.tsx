import type { ComponentProps } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { PerformedWorkerPicker } from "./payments/PerformedWorkerPicker";
import { AsyncButton } from "./ui/AsyncButton";

type Props = {
  jobId: string;
  canSubmit: boolean;
  remainingItems: number;
  remainingInventory: number;
  paused: boolean;
  uploading: boolean;
  pending: boolean;
  error: string;
  roster: ComponentProps<typeof PerformedWorkerPicker>;
  onSubmit: () => void;
};

/** One final confirmation for the form and job; server validation remains authoritative. */
export function CleanerSubmissionReview(props: Props) {
  const { t } = useTranslation();
  const blocked = !props.canSubmit || props.remainingItems > 0 || props.remainingInventory > 0 ||
    props.uploading || !props.roster.selected.length;
  return (
    <section className="card space-y-3" aria-label={t("jobCompletion.review")}>
      <p>{t("jobCompletion.explanation")}</p>
      {!props.canSubmit && <p role="status">{t("jobCompletion.teamLead")}</p>}
      {props.remainingItems > 0 && <p role="status">{t("jobCompletion.checklist", { count: props.remainingItems })}</p>}
      {props.remainingInventory > 0 && <p role="status">
        {t("jobCompletion.inventory", { count: props.remainingInventory })}{" "}
        <Link href={`/jobs/${props.jobId}`} className="text-primary-700 underline">{t("jobCompletion.reportInventory")}</Link>
      </p>}
      {props.paused && <p role="status">{t("jobCompletion.paused")}</p>}
      {props.uploading && <p role="status">{t("jobCompletion.uploading")}</p>}
      {props.canSubmit && <fieldset disabled={props.pending}>
        <PerformedWorkerPicker {...props.roster} />
        {!props.roster.selected.length && <p className="text-sm text-amber-800">{t("jobCompletion.selectWorkers")}</p>}
      </fieldset>}
      {props.error && <p role="alert" className="text-red-700">{props.error}</p>}
      <AsyncButton onClick={props.onSubmit} pending={props.pending} pendingLabel={t("jobCompletion.submitting")}
        disabled={blocked} className="btn-primary touch-target w-full">
        {t("jobCompletion.submit")}
      </AsyncButton>
    </section>
  );
}
