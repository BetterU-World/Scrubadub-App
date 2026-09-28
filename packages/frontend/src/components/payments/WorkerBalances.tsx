import { useState } from "react";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth, getStaffSessionToken } from "@/hooks/useAuth";
import { RecipientLedger, money } from "./RecipientLedger";

export function WorkerBalances() {
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
      {balances === undefined ? (
        <p>{t("common.loading")}</p>
      ) : balances.length === 0 ? (
        <p>{t("compensation.empty")}</p>
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
                : t("compensation.PAID")}
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
