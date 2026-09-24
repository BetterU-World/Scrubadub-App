import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { filterClientDocuments, type ClientDocumentRow } from "./clientDocumentModel";

function DocumentHistory({ row }: { row: ClientDocumentRow }) {
  const { user, sessionToken } = useAuth();
  const { t } = useTranslation();
  const history = useQuery((api as any).queries.documentsHub.getClientDocumentHistory,
    user && sessionToken ? { userId: user._id, sessionToken, type: row.type, documentId: row.id } : "skip") as
    Array<{ issueNumber: number; issuedAt: number; title: string; state: string; responseAt?: number | null }> | undefined;
  if (history === undefined) return <p className="text-sm text-gray-500">{t("documentsHub.loadingHistory")}</p>;
  if (!history.length) return <p className="text-sm text-gray-500">{t("documentsHub.noIssuedHistory")}</p>;
  return <ol className="space-y-2">
    {history.map((issue) => <li key={issue.issueNumber} className="min-w-0 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold">{t("documentsHub.version", { number: issue.issueNumber })}</span>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs text-gray-700">{t(`documentsHub.historyStates.${issue.state}`)}</span>
      </div>
      <p className="mt-1 break-words text-gray-800">{issue.title}</p>
      <p className="mt-1 text-xs text-gray-600">{t("documentsHub.issuedOn", { date: new Date(issue.issuedAt).toLocaleDateString() })}</p>
      {issue.responseAt && <p className="mt-1 text-xs text-gray-600">{t("documentsHub.responseOn", { date: new Date(issue.responseAt).toLocaleDateString() })}</p>}
    </li>)}
  </ol>;
}

export function ClientDocumentsSection() {
  const { user, sessionToken } = useAuth();
  const { t } = useTranslation();
  const data = useQuery((api as any).queries.documentsHub.listClientDocuments,
    user && sessionToken ? { userId: user._id, sessionToken } : "skip") as
    { rows: ClientDocumentRow[]; limited: boolean } | undefined;
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null);
  const rows = data?.rows ?? [];
  const statuses = useMemo(() => [...new Set(rows.filter((row) => type === "all" || row.type === type).map((row) => row.status))], [rows, type]);
  const visible = filterClientDocuments(rows, search, type, status);
  if (!data) return <PageLoader />;
  return <section className="min-w-0 space-y-4" aria-label={t("documentsHub.client")}>
    <div>
      <h2 className="text-lg font-semibold text-gray-900">{t("documentsHub.client")}</h2>
      <p className="mt-1 text-sm text-gray-600">{t("documentsHub.clientDescription")}</p>
    </div>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem_12rem]">
      <label className="min-w-0 text-sm font-medium text-gray-700">{t("documentsHub.search")}
        <input className="input-field mt-1 w-full" type="search" value={search} onChange={(event) => setSearch(event.target.value)}
          placeholder={t("documentsHub.searchPlaceholder")} />
      </label>
      <label className="min-w-0 text-sm font-medium text-gray-700">{t("documentsHub.type")}
        <select className="input-field mt-1 w-full" value={type} onChange={(event) => { setType(event.target.value); setStatus("all"); }}>
          <option value="all">{t("documentsHub.allTypes")}</option>
          <option value="proposal">{t("documentsHub.types.proposal")}</option>
          <option value="service_agreement">{t("documentsHub.types.service_agreement")}</option>
        </select>
      </label>
      <label className="min-w-0 text-sm font-medium text-gray-700">{t("documentsHub.status")}
        <select className="input-field mt-1 w-full" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">{t("documentsHub.allStatuses")}</option>
          {statuses.map((item) => <option key={item} value={item}>{t(`documentsHub.statuses.${item}`)}</option>)}
        </select>
      </label>
    </div>
    {data.limited && <p className="text-xs text-gray-600">{t("documentsHub.recentLimit")}</p>}
    {!rows.length ? <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5 text-sm text-gray-700">
      {t("documentsHub.clientEmpty")} <Link href="/requests" className="font-medium text-primary-700 underline-offset-2 hover:underline">{t("documentsHub.openRequests")}</Link>
    </div> : !visible.length ? <p className="rounded-xl border border-gray-200 p-5 text-sm text-gray-600">{t("documentsHub.noMatches")}</p>
      : <div className="space-y-3">{visible.map((row) => <article key={`${row.type}:${row.id}`} className="min-w-0 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase text-primary-700">{t(`documentsHub.types.${row.type}`)}</span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{t(`documentsHub.statuses.${row.status}`)}</span>
            </div>
            <h3 className="break-words font-semibold text-gray-900">{row.title}</h3>
            <p className="break-words text-sm text-gray-700">{[row.businessName, row.clientName].filter(Boolean).filter((value, index, all) => all.indexOf(value) === index).join(" · ")}</p>
            {row.address && <p className="break-words text-sm text-gray-600">{row.address}</p>}
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
              {row.date && <span>{t(`documentsHub.dates.${row.dateKind}`)}: {new Date(row.date).toLocaleDateString()}</span>}
              {row.issueNumber != null && <span>{t("documentsHub.version", { number: row.issueNumber })}</span>}
              {row.provenance === "legacy_current" && <span>{t("documentsHub.legacyContent")}</span>}
            </div>
          </div>
          {row.href && <Link href={row.href} className="btn-secondary w-full shrink-0 text-center text-sm md:w-auto">
            {t(row.destination === "account" ? "documentsHub.openAccount" : "documentsHub.openRequest")}
          </Link>}
        </div>
        {row.hasHistory && <div className="mt-3 border-t border-gray-100 pt-3">
          <button type="button" className="text-sm font-medium text-primary-700" aria-expanded={openHistoryId === row.id}
            onClick={() => setOpenHistoryId(openHistoryId === row.id ? null : row.id)}>
            {t(openHistoryId === row.id ? "documentsHub.hideHistory" : "documentsHub.showHistory")}
          </button>
          {openHistoryId === row.id && <div className="mt-3"><DocumentHistory row={row} /></div>}
        </div>}
      </article>)}</div>}
  </section>;
}
