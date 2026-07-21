import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { LeadsHeader } from "@/components/ui/LeadsHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { useTranslation } from "react-i18next";
import { useTimeAgo } from "@/hooks/useTimeAgo";
import { AlertCircle, ArrowRight, Building2, CheckCircle2, Inbox, Link2, MapPin, Search } from "lucide-react";

const STAGES = ["new", "qualification", "walkthrough", "proposal", "decision", "agreement", "onboarding", "converted", "closed"] as const;
const ATTENTION = ["all", "needs_attention", "overdue", "blocked", "stale"] as const;

export function PipelinePage() {
  const { user, sessionToken } = useAuth();
  const { t } = useTranslation();
  const timeAgo = useTimeAgo();
  const [search, setSearch] = useState("");
  const [attention, setAttention] = useState<(typeof ATTENTION)[number]>("all");
  const [leadType, setLeadType] = useState("all");
  const [sort, setSort] = useState("attention");
  const allRequests = useQuery(
    api.queries.clientRequests.listRequestsForPipeline,
    user && sessionToken ? { userId: user._id, sessionToken } : "skip"
  );

  const filtered = useMemo(() => {
    if (!allRequests) return [];
    const term = search.trim().toLocaleLowerCase();
    return allRequests
      .filter((request: any) => {
        const haystack = [request.requesterName, request.requesterEmail, request.businessName, request.propertySnapshot?.address].filter(Boolean).join(" ").toLocaleLowerCase();
        const attentionMatch = attention === "all" || (attention === "needs_attention" ? ["overdue", "blocked", "stale"].includes(request.pipeline.attention) : request.pipeline.attention === attention);
        return (!term || haystack.includes(term)) && attentionMatch && (leadType === "all" || request.leadType === leadType);
      })
      .sort((a: any, b: any) => {
        if (sort === "oldest") return a.createdAt - b.createdAt;
        if (sort === "newest") return b.createdAt - a.createdAt;
        const priority: Record<string, number> = { overdue: 0, blocked: 1, stale: 2, active: 3, none: 4 };
        return (priority[a.pipeline.attention] ?? 5) - (priority[b.pipeline.attention] ?? 5) || a.pipeline.latestActivityAt - b.pipeline.latestActivityAt;
      });
  }, [allRequests, attention, leadType, search, sort]);

  if (!user || allRequests === undefined) return <PageLoader />;
  const attentionCount = allRequests.filter((request: any) => ["overdue", "blocked", "stale"].includes(request.pipeline.attention)).length;

  return (
    <div>
      <LeadsHeader />
      <section aria-label={t("pipeline.workspaceControls")} className="card mb-5 space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div><p className="text-2xl font-semibold text-gray-900">{allRequests.length}</p><p className="text-xs text-gray-500">{t("pipeline.totalLeads")}</p></div>
          <div><p className="text-2xl font-semibold text-amber-700">{attentionCount}</p><p className="text-xs text-gray-500">{t("pipeline.needAttention")}</p></div>
          <div><p className="text-2xl font-semibold text-green-700">{allRequests.filter((request: any) => request.pipeline.stage === "converted").length}</p><p className="text-xs text-gray-500">{t("pipeline.converted")}</p></div>
        </div>
        <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_auto_auto_auto]">
          <label className="relative"><span className="sr-only">{t("pipeline.search")}</span><Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="input-field pl-9" placeholder={t("pipeline.searchPlaceholder")} /></label>
          <select aria-label={t("pipeline.attentionFilter")} className="input-field" value={attention} onChange={(event) => setAttention(event.target.value as any)}>{ATTENTION.map((value) => <option key={value} value={value}>{t(`pipeline.filters.${value}`)}</option>)}</select>
          <select aria-label={t("pipeline.leadTypeFilter")} className="input-field" value={leadType} onChange={(event) => setLeadType(event.target.value)}><option value="all">{t("pipeline.filters.allTypes")}</option>{["booking_request", "residential", "str_airbnb", "commercial", "move_out", "post_construction", "other"].map((value) => <option key={value} value={value}>{t(`leadTypes.${value}`)}</option>)}</select>
          <select aria-label={t("pipeline.sort")} className="input-field" value={sort} onChange={(event) => setSort(event.target.value)}><option value="attention">{t("pipeline.sorts.attention")}</option><option value="newest">{t("pipeline.sorts.newest")}</option><option value="oldest">{t("pipeline.sorts.oldest")}</option></select>
        </div>
      </section>

      {allRequests.length === 0 ? <EmptyState icon={Inbox} title={t("pipeline.noRequestsYet")} description={t("pipeline.noRequestsYetDesc")} /> : filtered.length === 0 ? <EmptyState icon={Search} title={t("pipeline.noMatches")} description={t("pipeline.noMatchesDesc")} /> : (
        <div className="-mx-4 overflow-x-auto px-4 pb-4" tabIndex={0} aria-label={t("pipeline.boardLabel")}>
          <div className="grid min-w-max grid-flow-col auto-cols-[minmax(280px,320px)] gap-4">
            {STAGES.map((stage) => {
              const items = filtered.filter((request: any) => request.pipeline.stage === stage);
              return <section key={stage} aria-labelledby={`pipeline-${stage}`}>
                <div className="mb-2 flex items-center justify-between"><h2 id={`pipeline-${stage}`} className="text-sm font-semibold text-gray-700">{t(`pipeline.stages.${stage}`)}</h2><span className="badge bg-gray-100 text-gray-600" aria-label={t("pipeline.stageCount", { count: items.length })}>{items.length}</span></div>
                <div className="min-h-[150px] space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-2">
                  {items.length === 0 ? <p className="py-8 text-center text-xs text-gray-400">{t("pipeline.noLeads")}</p> : items.map((request: any) => <article key={request._id} className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2"><div className="min-w-0"><Link href={`/requests/${request._id}`} className="font-medium text-gray-900 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">{request.requesterName}</Link>{request.businessName && <p className="truncate text-xs text-gray-500">{request.businessName}</p>}</div>{request.leadType === "commercial" ? <Building2 className="h-4 w-4 shrink-0 text-gray-400" /> : null}</div>
                    {request.propertySnapshot?.address && <p className="mt-1 flex items-center gap-1 truncate text-xs text-gray-500"><MapPin className="h-3 w-3 shrink-0" />{request.propertySnapshot.address}</p>}
                    {request.pipeline.attention !== "none" && request.pipeline.attention !== "active" && <span className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${request.pipeline.attention === "overdue" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}><AlertCircle className="h-3 w-3" />{t(`pipeline.attention.${request.pipeline.attention}`)}</span>}
                    <div className="mt-2 flex flex-wrap gap-1" aria-label={t("pipeline.linkedRecords")}>{Object.entries(request.pipeline.linked).filter(([key, value]) => key !== "clientPortal" && value).map(([key]) => <span key={key} title={t(`pipeline.links.${key}`)} className="inline-flex items-center rounded bg-gray-100 p-1 text-gray-500"><Link2 className="h-3 w-3" /><span className="sr-only">{t(`pipeline.links.${key}`)}</span></span>)}{request.pipeline.linked.clientPortal === "active" && <span title={t("pipeline.links.clientPortal")} className="inline-flex items-center rounded bg-green-100 p-1 text-green-700"><CheckCircle2 className="h-3 w-3" /><span className="sr-only">{t("pipeline.links.clientPortal")}</span></span>}</div>
                    <div className="mt-3 border-t pt-2"><p className="text-[11px] uppercase tracking-wide text-gray-400">{t("pipeline.nextAction")}</p><Link href={`/requests/${request._id}${request.pipeline.nextAction.hrefSuffix}`} className="mt-0.5 inline-flex items-center gap-1 text-sm font-medium text-primary-700 hover:text-primary-800">{t(`pipeline.actions.${request.pipeline.nextAction.key}`)}<ArrowRight className="h-3.5 w-3.5" /></Link><p className="mt-1 text-xs text-gray-400">{t("pipeline.lastActivity", { value: timeAgo(request.pipeline.latestActivityAt) })}</p></div>
                  </article>)}
                </div>
              </section>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}
