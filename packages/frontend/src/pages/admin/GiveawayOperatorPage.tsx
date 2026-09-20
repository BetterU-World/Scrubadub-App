import { useMemo, useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { Download, Gift, ShieldCheck, Users } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { currentGiveawayId } from "../../../../../convex/lib/giveawayCampaigns";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { TableScrollRegion } from "@/components/ui/TableScrollRegion";

type MethodFilter = "all" | "assessment" | "alternate";
const date = (value?: number | null) => value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" }).format(value) + " ET" : "—";
const percent = (part: number, total: number) => total ? `${Math.round(part * 100 / total)}%` : "0%";

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function GiveawayOperatorPage() {
  const { user, sessionToken, isLoading } = useAuth();
  const [method, setMethod] = useState<MethodFilter>("all");
  const canAccess = user?.isSuperadmin === true && Boolean(sessionToken);
  const args = canAccess ? { userId: user!._id, sessionToken, campaignId: currentGiveawayId } : "skip";
  const summary = useQuery(api.giveaways.operatorSummary, args);
  const { results, status, loadMore } = usePaginatedQuery(api.giveaways.entrants, args, { initialNumItems: 50 });
  const filtered = useMemo(() => results.filter(entry => method === "all" || (entry.entryMethod ?? "assessment") === method), [results, method]);

  if (isLoading) return <PageLoader />;
  if (!canAccess) return null;
  if (!summary) return <PageLoader />;

  const exportEntries = () => {
    const header = ["Entry timestamp", "Entry method", "Email", "Name", "Status", "Rules version", "Eligibility confirmed", "Marketing consent", "Assessment reference"];
    const rows = results.map(entry => [date(entry.qualifiedAt), entry.entryMethod ?? "assessment", entry.originalEmail, entry.firstName || entry.lastName ? `${entry.firstName ?? ""} ${entry.lastName ?? ""}`.trim() : "—", entry.status, entry.rulesVersion, entry.eligibilityConfirmedAt ? "Yes" : "No", entry.marketingConsent ? "Yes" : "No", entry.attemptId ?? "—"]);
    const blob = new Blob([[header, ...rows].map(row => row.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = `${summary.campaign.campaignId}-entrants.csv`; link.click(); URL.revokeObjectURL(url);
  };

  return <div>
    <PageHeader title="Giveaway operator" description="Private giveaway administration data. Do not share or publish entrant information." />
    {summary.scanCapped && <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Summary is limited to the first 10,000 records. Use the restricted export process for the canonical drawing pool.</p>}
    <section className="card mb-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-lg font-semibold text-gray-900">{summary.campaign.name}</h2><p className="text-sm text-gray-500">{summary.campaign.prize} · {summary.campaign.state[0].toUpperCase() + summary.campaign.state.slice(1)}</p></div><Gift className="h-5 w-5 text-primary-600" /></div>
      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3"><div><dt className="text-gray-500">Opening</dt><dd className="font-medium text-gray-800">September 21, 2026 at 12:00 AM ET</dd></div><div><dt className="text-gray-500">Closing</dt><dd className="font-medium text-gray-800">{summary.campaign.deadlineLabel}</dd></div><div><dt className="text-gray-500">Drawing</dt><dd className="font-medium text-gray-800">{summary.campaign.drawingLabel}</dd></div></dl>
    </section>
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
      <Metric label="Qualifying unique entries" value={summary.entries.total} icon={Users} detail={summary.entries.latestQualifiedAt ? `Latest: ${date(summary.entries.latestQualifiedAt)}` : "No entries yet"} />
      <Metric label="Assessment entries" value={summary.entries.assessment} icon={ShieldCheck} detail={percent(summary.entries.assessment, summary.entries.total)} />
      <Metric label="AMOE entries" value={summary.entries.alternate} icon={Gift} detail={percent(summary.entries.alternate, summary.entries.total)} />
      <Metric label="Duplicate entry events" value={summary.analytics.duplicateEvents} icon={ShieldCheck} detail="Recorded backend events" />
    </section>
    <section className="card mb-6"><h2 className="font-semibold text-gray-900">Backend giveaway analytics</h2><p className="mt-1 text-sm text-gray-500">Only SCRUB-owned backend events are shown. Page views and CTA activity remain in their existing Vercel Analytics surface.</p><div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3"><Fact label="Qualified Assessment entries" value={summary.analytics.qualifiedAssessment} /><Fact label="Qualified AMOE entries" value={summary.analytics.qualifiedAlternate} /><Fact label="Duplicate events" value={summary.analytics.duplicateEvents} /></div></section>
    <section className="card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-gray-900">Entrants</h2><p className="text-sm text-gray-500">Canonical combined entrant pool. Assessment answers and scores are intentionally unavailable here.</p></div><button className="btn-secondary inline-flex items-center justify-center gap-2" disabled={status !== "Exhausted"} onClick={exportEntries}><Download className="h-4 w-4" />Export loaded entrants</button></div>
      <div className="mt-4 flex gap-2" role="group" aria-label="Entry method filter">{(["all", "assessment", "alternate"] as const).map(value => <button key={value} className={method === value ? "btn-primary" : "btn-secondary"} onClick={() => setMethod(value)}>{value === "all" ? "All" : value === "assessment" ? "Assessment" : "AMOE"}</button>)}</div>
      <div className="mt-5 md:hidden space-y-3">{filtered.map(entry => <article key={entry._id} className="rounded-lg border border-gray-200 p-4 text-sm"><div className="flex justify-between gap-3"><strong>{entry.entryMethod ?? "assessment"}</strong><span>{date(entry.qualifiedAt)}</span></div><p className="mt-2 break-all text-gray-700">{entry.originalEmail}</p><p className="mt-1 text-gray-500">{entry.firstName || entry.lastName ? `${entry.firstName ?? ""} ${entry.lastName ?? ""}`.trim() : "No name collected"} · Consent: {entry.marketingConsent ? "Yes" : "No"}</p></article>)}</div>
      <TableScrollRegion label="Giveaway entrants table" className="mt-5 hidden md:block"><table className="min-w-[1000px] w-full text-left text-sm"><thead className="border-b text-xs uppercase tracking-wide text-gray-500"><tr>{["Entered", "Method", "Email", "Name", "Status", "Rules", "Eligible", "Consent", "Assessment reference"].map(label => <th key={label} className="px-3 py-3 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-gray-100">{filtered.map(entry => <tr key={entry._id}><td className="px-3 py-3 whitespace-nowrap">{date(entry.qualifiedAt)}</td><td className="px-3 py-3 capitalize">{entry.entryMethod ?? "assessment"}</td><td className="px-3 py-3">{entry.originalEmail}</td><td className="px-3 py-3">{entry.firstName || entry.lastName ? `${entry.firstName ?? ""} ${entry.lastName ?? ""}`.trim() : "—"}</td><td className="px-3 py-3">{entry.status}</td><td className="px-3 py-3">{entry.rulesVersion}</td><td className="px-3 py-3">{entry.eligibilityConfirmedAt ? "Yes" : "No"}</td><td className="px-3 py-3">{entry.marketingConsent ? "Yes" : "No"}</td><td className="px-3 py-3">{entry.attemptId ?? "—"}</td></tr>)}</tbody></table></TableScrollRegion>
      {!filtered.length && <p className="mt-5 text-sm text-gray-500">No qualifying entrants match this filter.</p>}
      {status !== "Exhausted" && <button className="btn-secondary mt-5" onClick={() => loadMore(50)}>Load more entrants</button>}
      {status !== "Exhausted" && <p className="mt-2 text-xs text-gray-500">Load all entrants before exporting the combined drawing pool.</p>}
    </section>
  </div>;
}

function Metric({ label, value, icon: Icon, detail }: { label: string; value: number; icon: typeof Gift; detail: string }) { return <div className="card"><div className="flex items-center gap-2 text-sm text-gray-500"><Icon className="h-4 w-4 text-primary-600" />{label}</div><p className="mt-2 text-2xl font-bold text-gray-900">{value}</p><p className="mt-1 text-xs text-gray-500">{detail}</p></div>; }
function Fact({ label, value }: { label: string; value: number }) { return <div><p className="text-sm text-gray-500">{label}</p><p className="mt-1 text-2xl font-bold text-gray-900">{value}</p></div>; }
