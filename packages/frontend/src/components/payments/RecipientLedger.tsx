import { compensationError } from "./compensationErrors";
import { useRef, useState } from "react";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth, getStaffSessionToken } from "@/hooks/useAuth";
import { DialogShell } from "@/components/ui/DialogShell";

import { money, parseMoney } from "./compensationMoney";
export { money, parseMoney } from "./compensationMoney";
type Correction = {
  kind: "adjust" | "void" | "reverse";
  id: string;
  version?: number;
};

export function RecipientLedger({ workerId }: { workerId?: Id<"users"> }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const auth = user
    ? { userId: user._id, sessionToken: getStaffSessionToken() }
    : null;
  const recipient = workerId
    ? { type: "worker" as const, userId: workerId }
    : undefined;
  const args = auth ? { ...auth, recipient } : ("skip" as const);
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
  const owner = user?.role === "owner";
  if (!auth || !totals) return null;
  const name = obligations.results[0]?.recipient.displayName;
  return (
    <div className="space-y-4 min-w-0">
      <h2 className="font-semibold text-xl break-words">
        {name ?? t("compensation.title")}
      </h2>
      <p className="text-sm text-gray-500">{t("compensation.outsideHelp")}</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
      {owner && workerId && totals.outstandingCents > 0 && (
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
          <p className="text-sm">
            {new Date(o.approvedAt).toLocaleDateString()} ·{" "}
            {t(
              `compensation.${o.lifecycle === "VOIDED" ? "VOIDED" : o.paymentState}`,
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
      {paymentOpen && workerId && (
        <RecordPayment
          workerId={workerId}
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
  };
  onReverse?: () => void;
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
      <p className="text-sm text-gray-500">{t("compensation.outsideHelp")}</p>
      {payment.publicReference && (
        <p className="text-sm break-words">{payment.publicReference}</p>
      )}
      {detail?.allocations.map((a) => (
        <AllocationLabel
          key={a._id}
          id={a.obligationId}
          cents={a.amountCents}
        />
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
function AllocationLabel({
  id,
  cents,
}: {
  id: Id<"outgoingObligations">;
  cents: number;
}) {
  const { user } = useAuth();
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
    <p className="text-sm break-words">
      {detail?.obligation.sourceLabel} · {money(cents)}
    </p>
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
  const [negative, setNegative] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const adjust = useMutation(api.outgoingMutations.adjustObligation);
  const voidDebt = useMutation(api.outgoingMutations.voidObligation);
  const reverse = useMutation(api.outgoingMutations.reverseOutsideSettlement);
  const retry = useRef(new Map<string, string>());
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
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={negative}
                onChange={(e) => setNegative(e.target.checked)}
              />
              {t("compensation.decrease")}
            </label>
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
            (command.kind === "adjust" && !(parseMoney(amount) ?? 0))
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
  workerId,
  name,
  onClose,
}: {
  workerId: Id<"users">;
  name?: string;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [amount, setAmount] = useState("");
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
    key: string;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const auth = user
    ? { userId: user._id, sessionToken: getStaffSessionToken() }
    : null;
  const obligations = usePaginatedQuery(
    api.outgoingQueries.listRecipientHistory,
    auth
      ? { ...auth, recipient: { type: "worker", userId: workerId } }
      : "skip",
    { initialNumItems: 50 },
  );
  const preview = useQuery(
    api.workerCompensation.previewPayment,
    auth && (parseMoney(amount) ?? 0) > 0
      ? {
          ...auth,
          workerId,
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
        recipient: { type: "worker", userId: workerId },
        currency: "USD",
        amountCents: parseMoney(amount)!,
        paymentDate: date,
        method,
        publicReference: reference.trim() || undefined,
        administrativeNote: note.trim() || undefined,
        idempotencyKey: confirmed.key,
        allocations: confirmed.allocations.map(({ sourceLabel, ...a }) => a),
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
      title={`${t("compensation.recordPayment")} · ${name ?? ""}`}
    >
      <div className="space-y-3">
        {!confirmed ? (
          <>
            <label className="block">
              {t("compensation.amount")}
              <input
                className="input-field"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label className="block">
              {t("compensation.paymentDate")}
              <input
                className="input-field"
                type="date"
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
                {methods.map((m) => (
                  <option key={m} value={m}>
                    {t(`compensation.${m}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              {t("compensation.reference")}
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
              disabled={!preview || !!preview.error || !date}
              onClick={() =>
                setConfirmed({
                  allocations: preview!.allocations,
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
              </p>
            ))}
            <p className="text-sm">{t("compensation.recordConfirm")}</p>
            {error && (
              <p role="alert" className="text-red-600 break-words">
                {error}
              </p>
            )}
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
