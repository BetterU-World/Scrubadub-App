import { FinancialBoundary } from "./FinancialBoundary";
import { compensationError } from "./compensationErrors";
import { useId, useRef, useState } from "react";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth, getStaffSessionToken } from "@/hooks/useAuth";
import { DialogShell } from "@/components/ui/DialogShell";

import { money, parseMoney } from "./compensationMoney";
export { money, parseMoney } from "./compensationMoney";
type Recipient =
  | { type: "worker"; userId: Id<"users"> }
  | { type: "partner_company"; companyId: Id<"companies"> };
type LedgerProps = {
  workerId?: Id<"users">;
  partnerCompanyId?: Id<"companies">;
  payerCompanyId?: Id<"companies">;
};
type Correction = {
  kind: "adjust" | "void" | "reverse";
  id: string;
  version?: number;
  base?: number;
  adjusted?: number;
  paid?: number;
};

export function RecipientLedger(props: LedgerProps) {
  return (
    <FinancialBoundary>
      <RecipientLedgerContent {...props} />
    </FinancialBoundary>
  );
}
function RecipientLedgerContent({
  workerId,
  partnerCompanyId,
  payerCompanyId,
}: LedgerProps) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const auth = user
    ? { userId: user._id, sessionToken: getStaffSessionToken() }
    : null;
  const recipient: Recipient | undefined = partnerCompanyId
    ? { type: "partner_company", companyId: partnerCompanyId }
    : workerId
      ? { type: "worker" as const, userId: workerId }
      : undefined;
  const args = auth
    ? { ...auth, recipient, payerCompanyId }
    : ("skip" as const);
  const totals = useQuery(api.outgoingQueries.recipientOutstandingTotals, args);
  const obligations = usePaginatedQuery(
    api.outgoingQueries.listRecipientHistory,
    args,
    { initialNumItems: 25 },
  );
  const payments = usePaginatedQuery(
    api.outgoingQueries.listSettlementHistory,
    args,
    { initialNumItems: 25 },
  );
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [correction, setCorrection] = useState<Correction | null>(null);
  const [history, setHistory] = useState<Id<"outgoingObligations"> | null>(
    null,
  );
  const owner =
    user?.role === "owner" &&
    (!payerCompanyId || payerCompanyId === user.companyId);
  if (!auth) return null;
  if (!totals) return <p role="status">{t("common.loading")}</p>;
  const name =
    payerCompanyId && payerCompanyId !== user?.companyId
      ? obligations.results[0]?.payerName
      : obligations.results[0]?.recipient.displayName;
  return (
    <div className="space-y-4 min-w-0">
      <h2 className="font-semibold text-xl break-words">
        {name ?? t("compensation.title")}
      </h2>
      <p className="text-sm text-gray-500">
        {t("compensation.outsideOverview")}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Summary
          label={t("compensation.approved")}
          value={money(totals.approvedCents)}
        />
        <Summary
          label={t("compensation.outstanding")}
          value={money(totals.outstandingCents)}
        />
        <Summary
          label={t("compensation.recordedPaid")}
          value={money(totals.recordedPaidCents)}
        />
        <Summary
          label={t("compensation.openItems")}
          value={String(totals.openObligationCount)}
        />
      </div>
      {owner && recipient && totals.outstandingCents > 0 && (
        <button className="btn-primary" onClick={() => setPaymentOpen(true)}>
          {t("compensation.recordPayment")}
        </button>
      )}
      <h3 className="font-semibold">{t("compensation.obligations")}</h3>
      {obligations.results.length === 0 && (
        <p className="text-sm text-gray-500">{t("compensation.empty")}</p>
      )}
      {obligations.results.map((o) => (
        <article className="card space-y-2 min-w-0" key={o._id}>
          <h4 className="font-medium break-words">{o.sourceLabel}</h4>
          {o.recipient.type === "partner_company" && (
            <p className="text-sm">
              {t("partnerCompensation.version", { version: o.termsVersion })} ·{" "}
              {t("compensation.approved")}: {money(o.basePrincipalCents)}
            </p>
          )}
          {o.adjusted && (
            <p className="text-sm">{t("compensation.adjustedIndicator")}</p>
          )}
          <p className="text-sm">
            {new Date(o.approvedAt).toLocaleDateString()} ·{" "}
            {t(
              `compensation.${o.lifecycle === "VOIDED" ? "VOIDED" : o.adjustedPrincipalCents === 0 && o.recordedPaidCents === 0 ? "noOutstanding" : o.paymentState}`,
            )}
          </p>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <Metric
              label={t("compensation.approved")}
              cents={o.basePrincipalCents}
            />
            <Metric
              label={t("compensation.adjustments")}
              cents={o.adjustmentCents}
            />
            <Metric
              label={t("compensation.adjustedTotal")}
              cents={o.adjustedPrincipalCents}
            />
            <Metric
              label={t("compensation.recordedPaid")}
              cents={o.recordedPaidCents}
            />
            <Metric
              label={t("compensation.outstanding")}
              cents={o.collectibleOutstandingCents}
            />
          </dl>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-secondary text-sm"
              onClick={() => setHistory(o._id)}
            >
              {t("compensation.history")}
            </button>
            {owner && o.lifecycle !== "VOIDED" && (
              <>
                <button
                  className="btn-secondary text-sm"
                  onClick={() =>
                    setCorrection({
                      kind: "adjust",
                      id: o._id,
                      version: o.ledgerVersion,
                      base: o.basePrincipalCents,
                      adjusted: o.adjustedPrincipalCents,
                      paid: o.recordedPaidCents,
                    })
                  }
                >
                  {t("compensation.adjust")}
                </button>
                {o.recordedPaidCents === 0 && (
                  <button
                    className="btn-secondary text-sm"
                    onClick={() =>
                      setCorrection({
                        kind: "void",
                        id: o._id,
                        version: o.ledgerVersion,
                      })
                    }
                  >
                    {t("compensation.void")}
                  </button>
                )}
              </>
            )}
          </div>
        </article>
      ))}
      {obligations.status === "CanLoadMore" && (
        <button
          className="btn-secondary"
          onClick={() => obligations.loadMore(25)}
        >
          {t("compensation.more")}
        </button>
      )}
      <h3 className="font-semibold">{t("compensation.payments")}</h3>
      {payments.results.length === 0 && (
        <p className="text-sm text-gray-500">{t("compensation.empty")}</p>
      )}
      {payments.results.map((p) => (
        <PaymentHistory
          key={p._id}
          payment={p}
          payerName={obligations.results[0]?.payerName}
          onReverse={
            owner && !p.ledgerReversed
              ? () => setCorrection({ kind: "reverse", id: p._id })
              : undefined
          }
        />
      ))}
      {payments.status === "CanLoadMore" && (
        <button className="btn-secondary" onClick={() => payments.loadMore(25)}>
          {t("compensation.more")}
        </button>
      )}
      {paymentOpen && recipient && (
        <RecordPayment
          recipient={recipient!}
          name={name}
          onClose={() => setPaymentOpen(false)}
        />
      )}
      {correction && (
        <CorrectionDialog
          command={correction}
          onClose={() => setCorrection(null)}
        />
      )}
      {history && (
        <ObligationHistory id={history} onClose={() => setHistory(null)} />
      )}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="card min-w-0">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="font-semibold text-xl break-words">{value}</p>
    </div>
  );
}
function Metric({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <dt>{label}</dt>
      <dd className="font-medium">{money(cents)}</dd>
    </div>
  );
}

function PaymentHistory({
  payment,
  payerName,
  onReverse,
}: {
  payment: {
    _id: Id<"outgoingSettlements">;
    amountCents: number;
    method: string;
    paymentDate: string;
    recordedAt: number;
    ledgerReversed: boolean;
    publicReference?: string;
    recipient: Recipient;
  };
  onReverse?: () => void;
  payerName?: string;
}) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const detail = useQuery(
    api.outgoingQueries.getSettlementDetail,
    user
      ? {
          userId: user._id,
          sessionToken: getStaffSessionToken(),
          settlementId: payment._id,
        }
      : "skip",
  );
  return (
    <article className="card space-y-2 min-w-0">
      <p className="font-medium">
        {money(payment.amountCents)} · {t(`compensation.${payment.method}`)}
      </p>
      <p className="text-sm">
        {t("compensation.paymentDate")}: {payment.paymentDate} ·{" "}
        {t("compensation.recordedDate")}:{" "}
        {new Date(payment.recordedAt).toLocaleDateString()}
      </p>
      <p className="text-sm text-gray-500">
        {t(
          payment.recipient.type === "partner_company"
            ? "partnerCompensation.recordedByPayer"
            : "compensation.outsideHelp",
          { name: payerName ?? "" },
        )}
      </p>
      {payment.publicReference && (
        <p className="text-sm break-words">{payment.publicReference}</p>
      )}
      {payment.recipient.type === "worker" && (
        <p className="text-sm">{t("compensation.recordedByCompany")}</p>
      )}
      {user?.role === "owner" &&
        detail &&
        "administrativeNote" in detail.settlement &&
        detail.settlement.administrativeNote && (
          <p className="text-sm break-words">
            {t("compensation.privateNote")}:{" "}
            {detail.settlement.administrativeNote}
          </p>
        )}
      {detail?.allocations.map((a) => (
        <p key={a._id} className="text-sm break-words">
          {a.sourceLabel} · {money(a.amountCents)}
        </p>
      ))}
      {payment.ledgerReversed && (
        <p className="text-amber-700">{t("compensation.reversed")}</p>
      )}
      {onReverse && (
        <button className="btn-secondary text-sm" onClick={onReverse}>
          {t("compensation.reverse")}
        </button>
      )}
    </article>
  );
}
function ObligationHistory({
  id,
  onClose,
}: {
  id: Id<"outgoingObligations">;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const detail = useQuery(
    api.outgoingQueries.getObligationDetail,
    user
      ? {
          userId: user._id,
          sessionToken: getStaffSessionToken(),
          obligationId: id,
        }
      : "skip",
  );
  return (
    <DialogShell open onOpenChange={onClose} title={t("compensation.history")}>
      <div className="space-y-3">
        {detail?.events.map((e) => (
          <div key={e._id} className="text-sm break-words">
            <p>
              {new Date(e.createdAt).toLocaleString()} ·{" "}
              {t(`compensation.${e.payload.type}`)}
            </p>
            {"reason" in e.payload && <p>{e.payload.reason}</p>}
            {"deltaCents" in e.payload && <p>{money(e.payload.deltaCents)}</p>}
          </div>
        ))}
      </div>
    </DialogShell>
  );
}

function CorrectionDialog({
  command,
  onClose,
}: {
  command: Correction;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const amountErrorId = useId();
  const [negative, setNegative] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const adjust = useMutation(api.outgoingMutations.adjustObligation);
  const voidDebt = useMutation(api.outgoingMutations.voidObligation);
  const reverse = useMutation(api.outgoingMutations.reverseOutsideSettlement);
  const retry = useRef(new Map<string, string>());
  const delta = (parseMoney(amount) ?? 0) * (negative ? -1 : 1);
  const nextPrincipal = (command.adjusted ?? 0) + delta;
  const invalidAdjustment =
    nextPrincipal < (command.paid ?? 0) || nextPrincipal > 1_000_000_000_000;
  async function submit() {
    if (!user) return;
    setPending(true);
    setError("");
    const content = JSON.stringify({ command, reason, amount, negative });
    const key = retry.current.get(content) ?? crypto.randomUUID();
    retry.current.set(content, key);
    const auth = {
      userId: user._id,
      sessionToken: getStaffSessionToken(),
      reason,
      idempotencyKey: key,
    };
    try {
      if (command.kind === "reverse")
        await reverse({
          ...auth,
          settlementId: command.id as Id<"outgoingSettlements">,
        });
      else if (command.kind === "void")
        await voidDebt({
          ...auth,
          obligationId: command.id as Id<"outgoingObligations">,
          expectedVersion: command.version!,
        });
      else
        await adjust({
          ...auth,
          obligationId: command.id as Id<"outgoingObligations">,
          expectedVersion: command.version!,
          deltaCents: (parseMoney(amount) ?? 0) * (negative ? -1 : 1),
        });
      onClose();
    } catch (e) {
      setError(compensationError(e, t));
    } finally {
      setPending(false);
    }
  }
  return (
    <DialogShell
      open
      onOpenChange={onClose}
      pending={pending}
      title={t(`compensation.${command.kind}`)}
    >
      <div className="space-y-3">
        <p className="text-sm">{t(`compensation.${command.kind}Help`)}</p>
        {command.kind === "adjust" && (
          <>
            <label className="block">
              {t("compensation.amount")}
              <input
                className="input-field"
                value={amount}
                inputMode="decimal"
                aria-invalid={amount.length > 0 && parseMoney(amount) === null}
                aria-describedby={
                  amount.length > 0 && parseMoney(amount) === null
                    ? amountErrorId
                    : undefined
                }
                onChange={(e) => setAmount(e.target.value)}
              />
              {amount.length > 0 && parseMoney(amount) === null && (
                <p
                  id={amountErrorId}
                  role="alert"
                  className="text-red-600 text-sm"
                >
                  {t("compensation.moneyError")}
                </p>
              )}
            </label>
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={negative}
                onChange={(e) => setNegative(e.target.checked)}
              />
              {t("compensation.decrease")}
            </label>
            <dl className="space-y-2 text-sm" aria-live="polite">
              <Metric
                label={t("compensation.approved")}
                cents={command.base ?? 0}
              />
              <Metric
                label={t("compensation.adjustedTotal")}
                cents={command.adjusted ?? 0}
              />
              <Metric label={t("compensation.change")} cents={delta} />
              <Metric
                label={t("compensation.afterAdjustment")}
                cents={nextPrincipal}
              />
              <Metric
                label={t("compensation.recordedPaid")}
                cents={command.paid ?? 0}
              />
              <Metric
                label={t("compensation.outstanding")}
                cents={Math.max(0, nextPrincipal - (command.paid ?? 0))}
              />
            </dl>
            {invalidAdjustment && (
              <p role="alert">
                {t(
                  nextPrincipal < (command.paid ?? 0)
                    ? "compensation.belowPaidError"
                    : "compensation.moneyError",
                )}
              </p>
            )}
          </>
        )}
        <label className="block">
          {t("compensation.reason")}
          <textarea
            className="input-field"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="text-red-600 break-words">
            {error}
          </p>
        )}
        <button
          className="btn-primary"
          disabled={
            pending ||
            !reason.trim() ||
            (command.kind === "adjust" &&
              (!(parseMoney(amount) ?? 0) || invalidAdjustment))
          }
          onClick={submit}
        >
          {t("compensation.confirm")}
        </button>
      </div>
    </DialogShell>
  );
}

type Allocation = {
  obligationId: Id<"outgoingObligations">;
  amountCents: number;
  expectedVersion: number;
  sourceLabel: string;
  remainingCents: number;
};
const methods = [
  "ach_or_bank_transfer",
  "zelle",
  "check",
  "cash",
  "payroll_provider",
  "other",
] as const;
function RecordPayment({
  recipient,
  name,
  onClose,
}: {
  recipient: Recipient;
  name?: string;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [amount, setAmount] = useState("");
  const amountErrorId = useId();
  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [method, setMethod] = useState<(typeof methods)[number]>(
    "ach_or_bank_transfer",
  );
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<Id<"outgoingObligations">[]>([]);
  const [confirmed, setConfirmed] = useState<{
    allocations: Allocation[];
    allocatedCents: number;
    remainingRecipientCents: number | null;
    key: string;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const auth = user
    ? { userId: user._id, sessionToken: getStaffSessionToken() }
    : null;
  const obligations = usePaginatedQuery(
    api.outgoingQueries.listRecipientHistory,
    auth ? { ...auth, recipient } : "skip",
    { initialNumItems: 50 },
  );
  const preview = useQuery(
    api.outgoingQueries.previewPayment,
    auth && (parseMoney(amount) ?? 0) > 0
      ? {
          ...auth,
          recipient,
          amountCents: parseMoney(amount)!,
          selectedObligationIds: selected.length ? selected : undefined,
        }
      : "skip",
  );
  const record = useMutation(api.outgoingMutations.recordOutsideSettlement);
  async function submit() {
    if (!auth || !confirmed) return;
    setPending(true);
    setError("");
    try {
      await record({
        ...auth,
        recipient,
        currency: "USD",
        amountCents: parseMoney(amount)!,
        paymentDate: date,
        method,
        publicReference: reference.trim() || undefined,
        administrativeNote: note.trim() || undefined,
        idempotencyKey: confirmed.key,
        allocations: confirmed.allocations.map(
          ({ obligationId, amountCents, expectedVersion }) => ({
            obligationId,
            amountCents,
            expectedVersion,
          }),
        ),
      });
      onClose();
    } catch (e) {
      setError(compensationError(e, t));
      if (
        /Stale|exceeds outstanding|Voided/.test(
          e instanceof Error ? e.message : String(e),
        )
      ) {
        setConfirmed(null);
        setError(t("compensation.stalePaymentError"));
      }
    } finally {
      setPending(false);
    }
  }
  return (
    <DialogShell
      open
      onOpenChange={onClose}
      pending={pending}
      title={`${t("compensation.recordPayment")} · ${name ?? ""}`}
    >
      <div className="space-y-3">
        {error && (
          <p role="alert" className="text-red-600 break-words">
            {error}
          </p>
        )}
        {!confirmed ? (
          <>
            <label className="block">
              {t("compensation.amount")}
              <input
                className="input-field"
                inputMode="decimal"
                aria-invalid={amount.length > 0 && parseMoney(amount) === null}
                aria-describedby={
                  amount.length > 0 && parseMoney(amount) === null
                    ? amountErrorId
                    : undefined
                }
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {amount.length > 0 && parseMoney(amount) === null && (
                <p
                  id={amountErrorId}
                  role="alert"
                  className="text-red-600 text-sm"
                >
                  {t("compensation.moneyError")}
                </p>
              )}
            </label>
            <label className="block">
              {t("compensation.paymentDate")}
              <span className="block text-xs text-gray-500">
                {t("compensation.dateHelp")}
              </span>
              <input
                className="input-field"
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label className="block">
              {t("compensation.method")}
              <select
                className="input-field"
                value={method}
                onChange={(e) => setMethod(e.target.value as typeof method)}
              >
                {methods
                  .filter(
                    (m) =>
                      recipient.type === "worker" || m !== "payroll_provider",
                  )
                  .map((m) => (
                    <option key={m} value={m}>
                      {t(`compensation.${m}`)}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block">
              {t(
                recipient.type === "partner_company"
                  ? "partnerCompensation.reference"
                  : "compensation.reference",
              )}
              <span className="block text-xs text-gray-500">
                {t(
                  recipient.type === "partner_company"
                    ? "partnerCompensation.referenceHelp"
                    : "compensation.referenceHelp",
                )}
              </span>
              <input
                className="input-field"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </label>
            <label className="block">
              {t("compensation.privateNote")}
              <textarea
                className="input-field"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <fieldset>
              <legend>{t("compensation.selectJobs")}</legend>
              <p className="text-xs text-gray-500">
                {t("compensation.oldestFirst")}
              </p>
              {obligations.results
                .filter((o) => o.collectibleOutstandingCents > 0)
                .map((o) => (
                  <label
                    className="flex items-start gap-2 py-2 text-sm"
                    key={o._id}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(o._id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, o._id]
                            : selected.filter((id) => id !== o._id),
                        )
                      }
                    />
                    <span className="min-w-0 break-words">
                      {o.sourceLabel} · {money(o.collectibleOutstandingCents)}
                    </span>
                  </label>
                ))}
              {obligations.status === "CanLoadMore" && (
                <button
                  className="btn-secondary"
                  onClick={() => obligations.loadMore(50)}
                >
                  {t("compensation.more")}
                </button>
              )}
            </fieldset>
            {preview?.error && (
              <p className="text-red-600 text-sm">
                {compensationError(preview.error, t)}
              </p>
            )}
            <button
              className="btn-primary"
              disabled={
                !preview ||
                !!preview.error ||
                !date ||
                date > new Date().toISOString().slice(0, 10)
              }
              onClick={() =>
                setConfirmed({
                  allocations: preview!.allocations,
                  allocatedCents: preview!.allocatedCents!,
                  remainingRecipientCents: preview!.remainingRecipientCents!,
                  key: crypto.randomUUID(),
                })
              }
            >
              {t("compensation.preview")}
            </button>
          </>
        ) : (
          <>
            <p className="font-semibold">
              {money(parseMoney(amount)!)} · {t(`compensation.${method}`)} ·{" "}
              {date}
            </p>
            <h3 className="font-medium">{t("compensation.appliedTo")}</h3>
            {confirmed.allocations.map((a) => (
              <p className="text-sm break-words" key={a.obligationId}>
                {a.sourceLabel} · {money(a.amountCents)}
                <span className="block">
                  {t("compensation.remainingOnJob")}: {money(a.remainingCents)}
                </span>
              </p>
            ))}
            <p>
              {t("compensation.totalAllocated")}:{" "}
              <strong>{money(confirmed.allocatedCents)}</strong>
            </p>
            <p>
              {confirmed.remainingRecipientCents === null
                ? t("compensation.remainingUnavailable")
                : `${t(recipient.type === "partner_company" ? "partnerCompensation.remainingCompany" : "compensation.remainingWorker")}: ${money(confirmed.remainingRecipientCents)}`}
            </p>
            {reference.trim() && (
              <p className="break-words">
                {t(recipient.type === "partner_company" ? "partnerCompensation.reference" : "compensation.reference")}: {reference}
              </p>
            )}
            <p className="text-sm">{t("compensation.recordConfirm")}</p>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-secondary"
                disabled={pending}
                onClick={() => setConfirmed(null)}
              >
                {t("compensation.edit")}
              </button>
              <button
                className="btn-primary"
                disabled={pending}
                onClick={submit}
              >
                {t("compensation.confirmRecord")}
              </button>
            </div>
          </>
        )}
      </div>
    </DialogShell>
  );
}
