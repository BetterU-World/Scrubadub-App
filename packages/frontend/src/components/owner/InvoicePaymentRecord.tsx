import { useTranslation } from "react-i18next";
import { formatClientMoney } from "../client/ClientPortalPage";

const eventKeys: Record<string, string> = {
  initiated: "initiated", open: "opened", paid: "attemptPaid", confirmed: "confirmed", outside: "outside",
  failed: "failed", expired: "expired", reconciliation_required: "attention",
  "charge.refunded": "refund", "charge.dispute.created": "disputeCreated",
  "charge.dispute.updated": "disputeUpdated", "charge.dispute.closed": "disputeClosed",
};

export function InvoicePaymentRecord({ record }: { record: any }) {
  const { t } = useTranslation();
  if (!record) return null;
  return <section className="card space-y-3" aria-label={t("paymentRecord.title")}>
    <h2 className="text-lg font-semibold text-gray-900">{t("paymentRecord.title")}</h2>
    <p className="font-medium">{t(`paymentRecord.states.${record.state}`)}</p>
    {record.needsAttention && <p role="alert" className="text-sm text-amber-800">{t("paymentRecord.attentionHelp")}</p>}
    {record.state === "paid" && <p className="text-sm text-gray-600">{t(`paymentRecord.sources.${record.source}`)}</p>}
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between gap-4"><dt>{t("paymentRecord.invoiceAmount")}</dt><dd>{formatClientMoney(record.invoiceAmountCents)}</dd></div>
      {record.paymentAmountCents != null && <div className="flex justify-between gap-4"><dt>{t("paymentRecord.paymentAmount")}</dt><dd>{formatClientMoney(record.paymentAmountCents)}</dd></div>}
      {record.state === "paid" && <>
        <div className="flex justify-between gap-4"><dt>{t("paymentRecord.fee")}</dt><dd>{record.platformFeeCents == null ? t("paymentRecord.unavailable") : formatClientMoney(record.platformFeeCents)}</dd></div>
        <div className="flex justify-between gap-4"><dt>{t("paymentRecord.paidAt")}</dt><dd>{record.paidAt ? new Date(record.paidAt).toLocaleString() : t("paymentRecord.unavailable")}</dd></div>
      </>}
    </dl>
    {record.state === "paid" && record.source === "online" && <p className="text-sm text-gray-500">{t("paymentRecord.methodUnavailable")}</p>}
    {record.hasRefundEvidence && <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">{t("paymentRecord.refundEvidence")}</p>}
    {record.hasDisputeEvidence && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{t("paymentRecord.disputeEvidence")}</p>}
    {record.history.length > 0 && <details>
      <summary className="cursor-pointer text-sm font-medium">{t("paymentRecord.history")}</summary>
      <p className="mt-2 text-xs text-gray-500">{t("paymentRecord.historyHelp")}</p>
      <ol className="mt-2 space-y-2 text-sm">{record.history.map((event: any, index: number) => <li key={index}>
        <span>{t(`paymentRecord.events.${eventKeys[event.kind] ?? "update"}`)}</span>
        {event.recordedAt && <time className="ml-2 text-gray-500" dateTime={new Date(event.recordedAt).toISOString()}>{new Date(event.recordedAt).toLocaleString()}</time>}
      </li>)}</ol>
    </details>}
    {record.references && <details>
      <summary className="cursor-pointer text-sm font-medium">{t("paymentRecord.references")}</summary>
      <p className="mt-2 text-xs text-gray-500">{t("paymentRecord.referencesHelp")}</p>
      {record.references.chargeModel === "destination" && <p className="mt-2 text-sm">{t("paymentRecord.historical")}</p>}
      <dl className="mt-2 space-y-2 break-all text-xs">
        {record.references.paymentIntentId && <div><dt>{t("paymentRecord.paymentReference")}</dt><dd>{record.references.paymentIntentId}</dd></div>}
        {record.references.checkoutSessionId && <div><dt>{t("paymentRecord.checkoutReference")}</dt><dd>{record.references.checkoutSessionId}</dd></div>}
      </dl>
    </details>}
  </section>;
}
