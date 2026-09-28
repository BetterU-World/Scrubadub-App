import { useQuery } from "convex/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { useAuth, getStaffSessionToken } from "@/hooks/useAuth";
import { money } from "./RecipientLedger";
import { FinancialBoundary } from "./FinancialBoundary";

export function LegacyWorkerHistory({
  company = false,
}: {
  company?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <details className="card" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer font-medium">{t("compensation.legacy")}</summary>
      <p className="text-sm text-gray-500 my-3">{t("compensation.legacyHelp")}</p>
      {open && <FinancialBoundary><LegacyWorkerRows company={company} /></FinancialBoundary>}
    </details>
  );
}

function LegacyWorkerRows({ company }: { company: boolean }) {
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
    <div>
      {rows?.map((r) => (
        <div key={r._id} className="border-t py-3 text-sm break-words">
          <p>
            {"cleanerName" in r ? r.cleanerName : ""} · {r.jobLabel}
          </p>
          <p>
            {r.amountCents == null
              ? t("compensation.amountMissing")
              : money(r.amountCents)}{" "}
            · {t(r.status === "OPEN" ? "compensation.legacyOpen" : r.status === "PAID" ? "compensation.legacyPaid" : "compensation.legacyCanceled")}
          </p>
          <p>
            {r.method === "outside_app"
              ? t("compensation.outsideHelp")
              : t("compensation.legacyMethod")}
          </p>
        </div>
      ))}
    </div>
  );
}
