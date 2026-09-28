import { compensationError } from "./compensationErrors";
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth, getStaffSessionToken } from "@/hooks/useAuth";
import { PerformedWorkerPicker } from "./PerformedWorkerPicker";
import { RecipientLedger, money, parseMoney } from "./RecipientLedger";

export function JobCompensation({ jobId }: { jobId: Id<"jobs"> }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const canRead =
    user?.role === "owner" ||
    (user?.role === "manager" && user.canViewFinancials);
  const auth = user
    ? { userId: user._id, sessionToken: getStaffSessionToken() }
    : null;
  const data = useQuery(
    api.workerCompensation.jobCompensation,
    canRead && auth ? { ...auth, jobId } : "skip",
  );
  const candidates = useQuery(
    api.workerCompensation.historicalCandidates,
    user?.role === "owner" &&
      data?.operationallyApproved &&
      !data.evidence &&
      auth
      ? auth
      : "skip",
  );
  const confirm = useMutation(api.workerCompensation.confirmHistoricalWorkers);
  const approve = useMutation(api.workerCompensation.reviewCompensation);
  const [selected, setSelected] = useState<Id<"users">[]>([]);
  const [detail, setDetail] = useState<Id<"users"> | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function run(action: () => Promise<unknown>) {
    setPending(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(compensationError(e, t));
    } finally {
      setPending(false);
    }
  }
  if (!canRead || !data || !auth) return null;
  return (
    <section
      className="card space-y-4 min-w-0"
      aria-label={t("compensation.title")}
    >
      <h2 className="font-semibold text-lg">{t("compensation.title")}</h2>
      {error && (
        <p role="alert" className="text-red-600 break-words">
          {error}
        </p>
      )}
      {!data.operationallyApproved && <p>{t("compensation.notReady")}</p>}
      {data.operationallyApproved && !data.evidence && (
        <>
          <p className="text-sm text-gray-500">
            {t("compensation.historicalMissing")}
          </p>
          {user?.role === "owner" && (
            <>
              <PerformedWorkerPicker
                candidates={candidates ?? []}
                selected={selected}
                setSelected={setSelected}
              />
              <button
                className="btn-primary"
                disabled={pending || !selected.length}
                onClick={() =>
                  run(() =>
                    confirm({ ...auth, jobId, performedWorkerIds: selected }),
                  )
                }
              >
                {t("compensation.confirmRoster")}
              </button>
            </>
          )}
        </>
      )}
      {data.evidence && (
        <p className="text-xs text-gray-500">
          {t(`compensation.${data.evidence.provenance}`)} ·{" "}
          {new Date(data.evidence.confirmedAt).toLocaleDateString()}
        </p>
      )}
      {data.workers.map((w) => {
        const obligation = data.obligations.find(
          (o) =>
            o.recipient.type === "worker" && o.recipient.userId === w.userId,
        );
        return (
          <div
            key={w.userId}
            className="border rounded-lg p-3 space-y-2 min-w-0"
          >
            <h3 className="font-medium break-words">{w.displayName}</h3>
            {w.inactive && (
              <p className="text-sm">{t("compensation.inactive")}</p>
            )}
            {obligation ? (
              <>
                <p>
                  {t(
                    `compensation.${obligation.lifecycle === "VOIDED" ? "VOIDED" : obligation.paymentState}`,
                  )}{" "}
                  · {t("compensation.outstanding")}:{" "}
                  {money(obligation.collectibleOutstandingCents)}
                </p>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt>{t("compensation.approved")}</dt>
                    <dd>{money(obligation.basePrincipalCents)}</dd>
                  </div>
                  <div>
                    <dt>{t("compensation.recordedPaid")}</dt>
                    <dd>{money(obligation.recordedPaidCents)}</dd>
                  </div>
                  {obligation.adjusted && (
                    <div>
                      <dt>{t("compensation.adjustments")}</dt>
                      <dd>{money(obligation.adjustmentCents)}</dd>
                    </div>
                  )}
                </dl>
                <button
                  className="btn-secondary"
                  onClick={() => setDetail(w.userId)}
                >
                  {t("compensation.history")}
                </button>
              </>
            ) : w.noCompensation ? (
              <p>
                {t("compensation.noCompensation")} · {w.noCompensation.reason}
              </p>
            ) : data.operationallyApproved ? (
              <>
                <p className="text-sm text-gray-500">
                  {t("compensation.needsApproval")}
                </p>
                {user?.role === "owner" && (
                  <ReviewLine
                    suggestion={w.suggestionCents}
                    pending={pending}
                    onApprove={(amount, reason) =>
                      run(() =>
                        approve({
                          ...auth,
                          jobId,
                          workerId: w.userId,
                          amountCents: amount,
                          reason,
                        }),
                      )
                    }
                  />
                )}
              </>
            ) : null}
          </div>
        );
      })}
      {data.evidence?.workers.some((w) => w.role === "owner") && (
        <p className="text-sm text-gray-500">{t("compensation.ownerWork")}</p>
      )}
      {data.obligations
        .filter(
          (o) =>
            !data.workers.some(
              (w) =>
                o.recipient.type === "worker" &&
                w.userId === o.recipient.userId,
            ),
        )
        .map((o) => (
          <div key={o._id}>
            <p>
              {o.recipient.displayName} · {money(o.collectibleOutstandingCents)}
            </p>
            {o.recipient.type === "worker" && (
              <button
                className="btn-secondary"
                onClick={() =>
                  setDetail((o.recipient as { userId: Id<"users"> }).userId)
                }
              >
                {t("compensation.history")}
              </button>
            )}
          </div>
        ))}
      {detail && (
        <>
          <button className="btn-secondary" onClick={() => setDetail(null)}>
            {t("common.close")}
          </button>
          <RecipientLedger workerId={detail} />
        </>
      )}
    </section>
  );
}

function ReviewLine({
  suggestion,
  pending,
  onApprove,
}: {
  suggestion?: number;
  pending: boolean;
  onApprove: (cents: number, reason: string) => void;
}) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState(
    suggestion === undefined ? "" : (suggestion / 100).toFixed(2),
  );
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="space-y-2">
      <label className="block text-sm">
        {t("compensation.suggested")}
        <input
          className="input-field mt-1"
          inputMode="decimal"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setConfirming(false);
          }}
        />
      </label>
      <label className="block text-sm">
        {t("compensation.reason")}
        <input
          className="input-field mt-1"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setConfirming(false);
          }}
        />
      </label>
      {confirming && (
        <p className="text-sm">
          {t("compensation.approvalConfirm", {
            amount: money(parseMoney(amount) ?? 0),
          })}
        </p>
      )}
      <button
        className="btn-primary"
        disabled={pending || parseMoney(amount) === null || !reason.trim()}
        onClick={() =>
          confirming
            ? onApprove(parseMoney(amount)!, reason)
            : setConfirming(true)
        }
      >
        {t(confirming ? "compensation.confirmApproval" : "compensation.review")}
      </button>
    </div>
  );
}
