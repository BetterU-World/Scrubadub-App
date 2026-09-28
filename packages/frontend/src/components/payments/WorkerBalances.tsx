import { FinancialBoundary } from "./FinancialBoundary";
import { useState } from "react";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth, getStaffSessionToken } from "@/hooks/useAuth";
import { RecipientLedger, money } from "./RecipientLedger";

export function WorkerBalances() {
  return (
    <FinancialBoundary>
      <WorkerBalancesContent />
    </FinancialBoundary>
  );
}
function WorkerBalancesContent() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const balances = useQuery(
    api.workerCompensation.workerBalances,
    user ? { userId: user._id, sessionToken: getStaffSessionToken() } : "skip",
  );
  const [selected, setSelected] = useState<Id<"users"> | null>(
    () =>
      new URLSearchParams(window.location.search).get(
        "worker",
      ) as Id<"users"> | null,
  );
  if (selected)
    return (
      <div className="space-y-4">
        <button className="btn-secondary" onClick={() => setSelected(null)}>
          {t("compensation.back")}
        </button>
        <RecipientLedger key={selected} workerId={selected} />
      </div>
    );
  return (
    <div className="space-y-4 min-w-0">
      <p className="text-sm text-gray-500">{t("compensation.hubHelp")}</p>
      <h2 className="font-semibold text-xl">{t("compensation.workerOwed")}</h2>
      {balances && balances.length > 0 && (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 card">
          <div>
            <dt>{t("compensation.workerOwed")}</dt>
            <dd className="font-semibold text-xl">
              {money(balances.reduce((n, b) => n + b.outstandingCents, 0))}
            </dd>
          </div>
          <div>
            <dt>{t("compensation.workersOutstanding")}</dt>
            <dd>{balances.filter((b) => b.outstandingCents > 0).length}</dd>
          </div>
          <div>
            <dt>{t("compensation.openItems")}</dt>
            <dd>{balances.reduce((n, b) => n + b.openCount, 0)}</dd>
          </div>
          {balances.some((b) => b.oldestApprovedAt !== undefined) && (
            <div>
              <dt>{t("compensation.oldest")}</dt>
              <dd>
                {new Date(
                  Math.min(
                    ...balances.flatMap((b) =>
                      b.oldestApprovedAt === undefined
                        ? []
                        : [b.oldestApprovedAt],
                    ),
                  ),
                ).toLocaleDateString()}
              </dd>
            </div>
          )}
        </dl>
      )}
      {balances === undefined ? (
        <p>{t("common.loading")}</p>
      ) : balances.length === 0 ? (
        <p>{t("compensation.ownerEmpty")}</p>
      ) : (
        balances.map((b) => (
          <article className="card space-y-3 min-w-0" key={b.workerId}>
            <h3 className="font-semibold break-words">{b.displayName}</h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div>
                {t("compensation.outstanding")}:{" "}
                <strong>{money(b.outstandingCents)}</strong>
              </div>
              <div>
                {t("compensation.approved")}: {money(b.approvedCents)}
              </div>
              <div>
                {t("compensation.recordedPaid")}: {money(b.recordedPaidCents)}
              </div>
              <div>
                {t("compensation.openItems")}: {b.openCount}
              </div>
            </dl>
            <p className="text-sm">
              {b.outstandingCents > 0
                ? t("compensation.OWED")
                : t("compensation.noOutstanding")}
              {b.oldestApprovedAt &&
                ` · ${t("compensation.oldest")}: ${new Date(b.oldestApprovedAt).toLocaleDateString()}`}
            </p>
            <button
              className="btn-secondary"
              onClick={() => setSelected(b.workerId)}
            >
              {t("compensation.detail")}
            </button>
          </article>
        ))
      )}
    </div>
  );
}
