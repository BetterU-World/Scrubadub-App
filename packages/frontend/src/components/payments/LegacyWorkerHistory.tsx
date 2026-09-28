import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { useAuth, getStaffSessionToken } from "@/hooks/useAuth";
import { money } from "./RecipientLedger";

export function LegacyWorkerHistory({
  company = false,
}: {
  company?: boolean;
}) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const args = user
    ? { userId: user._id, sessionToken: getStaffSessionToken() }
    : ("skip" as const);
  const mine = useQuery(
    api.queries.cleanerPayments.listMyCleanerPayments,
    company ? "skip" : args,
  );
  const all = useQuery(
    api.queries.cleanerPayments.listCleanerPaymentsForCompany,
    company ? args : "skip",
  );
  const rows = company ? all : mine;
  return (
    <details className="card">
      <summary className="cursor-pointer font-medium">
        {t("compensation.legacy")}
      </summary>
      <p className="text-sm text-gray-500 my-3">
        {t("compensation.legacyHelp")}
      </p>
      {rows?.map((r) => (
        <div key={r._id} className="border-t py-3 text-sm break-words">
          <p>
            {"cleanerName" in r ? r.cleanerName : ""} · {r.jobLabel}
          </p>
          <p>
            {r.amountCents == null
              ? t("compensation.amountMissing")
              : money(r.amountCents)}{" "}
            · {r.status === "OPEN" ? t("compensation.legacyOpen") : r.status}
          </p>
          <p>
            {r.method === "outside_app"
              ? t("compensation.outsideHelp")
              : t("compensation.legacyMethod")}
          </p>
        </div>
      ))}
    </details>
  );
}
