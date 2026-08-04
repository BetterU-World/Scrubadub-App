import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { CalendarClock, MapPin, Search, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

const FILTERS = ["action_required", "scheduled", "declined", "all"] as const;

export function JobRequestListPage() {
  const { user, sessionToken } = useAuth(); const { t } = useTranslation();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("action_required");
  const [sort, setSort] = useState("newest"); const [search, setSearch] = useState("");
  const data = useQuery((api as any).queries.clientRequests.listJobRequests, user && sessionToken ? { userId: user._id, sessionToken } : "skip");
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...(data ?? [])].filter((item: any) => (filter === "all" || item.status === filter || (filter === "scheduled" && ["scheduled", "in_progress", "completed"].includes(item.status))) && (!term || [item.requesterName, item.relationshipName, item.locationName, item.locationAddress, item.requestedService].filter(Boolean).join(" ").toLowerCase().includes(term))).sort((a: any, b: any) => sort === "oldest" ? a.submittedAt - b.submittedAt : sort === "preferred" ? (a.requestedDate || "9999").localeCompare(b.requestedDate || "9999") : b.submittedAt - a.submittedAt);
  }, [data, filter, search, sort]);
  if (!user || data === undefined) return <PageLoader />;
  return <div className="min-w-0"><PageHeader title={t("jobRequests.title")} description={t("jobRequests.description")} back={{ href: "/jobs", label: t("jobRequests.backToJobs") }} />
    <section className="card mb-4 space-y-3" aria-label={t("jobRequests.controls")}><div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label={t("jobRequests.filtersLabel")}>{FILTERS.map(value => <button key={value} type="button" onClick={() => setFilter(value)} className={`touch-target flex-none rounded-full px-3 text-sm font-medium ${filter === value ? "bg-primary-100 text-primary-800" : "bg-gray-100 text-gray-600"}`}>{t(`jobRequests.filters.${value}`)}</button>)}</div><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><label className="relative"><span className="sr-only">{t("jobRequests.search")}</span><Search className="absolute left-3 top-3 h-4 w-4 text-gray-400"/><input className="input-field pl-9" value={search} onChange={e => setSearch(e.target.value)} placeholder={t("jobRequests.searchPlaceholder")}/></label><select aria-label={t("jobRequests.sortLabel")} className="input-field" value={sort} onChange={e => setSort(e.target.value)}><option value="newest">{t("jobRequests.sorts.newest")}</option><option value="oldest">{t("jobRequests.sorts.oldest")}</option><option value="preferred">{t("jobRequests.sorts.preferred")}</option></select></div></section>
    {rows.length === 0 ? <EmptyState icon={CalendarClock} title={t("jobRequests.empty")} description={t("jobRequests.emptyDescription")} /> : <div className="space-y-3">{rows.map((item: any) => <article key={item._id} className="card min-w-0"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="break-words font-semibold text-gray-900">{item.requesterName}</h2><span className={`badge ${item.status === "action_required" ? "bg-amber-100 text-amber-800" : item.status === "declined" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>{t(`jobRequests.statuses.${item.status}`)}</span><span className="badge bg-primary-50 text-primary-800">{t("jobRequests.existingClient")}</span></div><p className="mt-2 flex min-w-0 items-start gap-1 text-sm text-gray-600"><MapPin className="mt-0.5 h-4 w-4 shrink-0"/><span className="break-words">{[item.locationName, item.locationAddress].filter(Boolean).join(" · ")}</span></p><p className="mt-1 flex items-center gap-1 text-sm text-gray-600"><Sparkles className="h-4 w-4 shrink-0"/>{item.requestedService}</p><p className="mt-2 text-sm font-medium text-gray-800">{t("jobRequests.preferred")}: {item.requestedDate || "—"} · {t(`clientRequests.timeWindows.${item.timeWindow}`, { defaultValue: item.timeWindow })}</p>{item.requestedAddOns.length > 0 && <p className="mt-1 break-words text-sm text-gray-500">{t("jobRequests.addOns")}: {item.requestedAddOns.map((addOn: any) => addOn.name).join(", ")}</p>}{item.notes && <p className="mt-2 line-clamp-2 whitespace-pre-wrap break-words text-sm text-gray-600">{item.notes}</p>}<p className="mt-2 text-xs text-gray-400">{t("jobRequests.submitted", { date: new Date(item.submittedAt).toLocaleString() })}</p></div><Link href={`/jobs/requests/${item._id}`} className="btn-primary touch-target w-full text-center sm:w-auto">{t("jobRequests.openDetails")}</Link></div></article>)}</div>}
  </div>;
}
