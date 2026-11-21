import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Link, useLocation, useRoute } from "wouter";
import {
  Activity,
  ArrowRight,
  Building2,
  RefreshCw,
  Shield,
  Users,
} from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";

type Report = FunctionReturnType<typeof api.adminHub.report>;
type Company = NonNullable<FunctionReturnType<typeof api.adminHubData.company>>;
type Counts = Report["counts"];
export const utc = (time: number | null) =>
  time === null
    ? "Not observed"
    : new Date(time).toLocaleString("en-US", {
        timeZone: "UTC",
        dateStyle: "medium",
        timeStyle: "short",
      }) + " UTC";
const number = (value: number) => value.toLocaleString("en-US");
const links = [
  ["/admin", "Overview"],
  ["/admin/companies", "Companies"],
  ["/admin/engagement", "Engagement"],
  ["/admin/billing", "Billing & access"],
];

function useReport(companyId?: Id<"companies">) {
  const { user, sessionToken } = useAuth();
  const action = useAction(api.adminHub.report);
  const [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState("");
  const [loading, setLoading] = useState(false),
    [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const userId = user?._id,
    allowed = user?.isSuperadmin === true;
  useEffect(() => {
    const request = ++generation.current;
    setReport(null);
    setError("");
    setLoading(false);
    if (!allowed || !userId || !sessionToken) return;
    setLoading(true);
    action({ userId, sessionToken, ...(companyId ? { companyId } : {}) })
      .then((result) => {
        if (generation.current === request) setReport(result);
      })
      .catch(() => {
        if (generation.current === request)
          setError(
            "Report could not be completed. No partial totals are shown. Retry or open one company.",
          );
      })
      .finally(() => {
        if (generation.current === request) setLoading(false);
      });
    return () => {
      generation.current++;
    };
  }, [action, allowed, userId, sessionToken, companyId, revision]);
  return { report, error, loading, refresh: () => setRevision((r) => r + 1) };
}

export function SuperAdminPage() {
  const { user, sessionToken, isLoading } = useAuth();
  const [path] = useLocation();
  const [, params] = useRoute("/admin/companies/:companyId");
  const canAccess = user?.isSuperadmin === true && Boolean(sessionToken);
  if (isLoading) return <PageLoader />;
  if (!canAccess) return null;
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Founder command center"
        description="Platform growth, company adoption and evidence you can trust."
      />
      <nav
        aria-label="Founder hub"
        className="flex flex-wrap gap-2 border-b border-gray-200 pb-4"
      >
        {links.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            aria-current={
              path === href || (href === "/admin/companies" && !!params)
                ? "page"
                : undefined
            }
            className={`inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold ${path === href || (href === "/admin/companies" && !!params) ? "bg-primary-600 text-white" : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <ErrorBoundary key={path}>
        {params ? (
          <CompanyDetail companyId={params.companyId as Id<"companies">} />
        ) : path === "/admin/companies" ? (
          <CompanyDirectory />
        ) : (
          <PlatformReport
            section={
              path === "/admin/engagement"
                ? "engagement"
                : path === "/admin/billing"
                  ? "billing"
                  : "overview"
            }
          />
        )}
      </ErrorBoundary>
      <section className="card">
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-gray-900">
          <Shield className="h-4 w-4" />
          Existing operations
        </h2>
        <div className="flex flex-wrap gap-3">
          {[
            ["/admin/assessments", "Assessment results"],
            ["/admin/giveaways", "Giveaways"],
            ["/admin/affiliates", "Affiliate invitations"],
            ["/affiliate", "Affiliate & payout workspace"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="btn-secondary inline-flex min-h-11 items-center gap-2"
            >
              {label}
              <ArrowRight className="h-4 w-4" />
            </Link>
          ))}
        </div>
        <p className="mt-3 text-xs text-gray-600">
          Existing permissions still apply. Restricted cleanup remains at its
          existing direct route.
        </p>
      </section>
    </div>
  );
}

function Kpi({
  title,
  value,
  hint,
}: {
  title: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="card">
      <p className="text-sm font-medium text-gray-600">{title}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
        {number(value)}
      </p>
      {hint && <p className="mt-2 text-xs text-gray-600">{hint}</p>}
    </div>
  );
}
function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      {children}
    </div>
  );
}
function Status({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700">
      {children}
    </span>
  );
}
function ReportState({ state }: { state: ReturnType<typeof useReport> }) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-600">
        <p>
          {state.report
            ? `Window reference: ${utc(state.report.asOf)} · Read completed: ${utc(state.report.finishedAt)}`
            : "On-demand report · bounded read pages · all companies included"}
        </p>
        <button
          type="button"
          className="btn-secondary inline-flex min-h-11 items-center gap-2"
          disabled={state.loading}
          onClick={state.refresh}
        >
          <RefreshCw
            className={`h-4 w-4 ${state.loading ? "animate-spin" : ""}`}
          />
          {state.loading ? "Calculating…" : "Refresh report"}
        </button>
      </div>
      {state.loading && (
        <p role="status" className="card text-sm text-gray-600">
          Calculating complete totals in bounded pages. Larger workspaces may
          take longer.
        </p>
      )}
      {state.error && (
        <div role="alert">
          <Notice>{state.error}</Notice>
        </div>
      )}
      {state.report && (
        <p className="text-xs text-gray-600">
          {state.report.pages} read pages. Records can change during this
          interval; this is not an atomic snapshot.
        </p>
      )}
    </>
  );
}
function Population({
  counts: c,
  company = false,
}: {
  counts: Counts;
  company?: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {!company && (
        <Kpi
          title="Companies"
          value={c.companies ?? 0}
          hint={`${c.qaCompanies ?? 0} marked QA; internal accounts included`}
        />
      )}
      <Kpi
        title="Owner accounts"
        value={c["role:owner"] ?? 0}
        hint="All account statuses"
      />
      <Kpi
        title="Manager accounts"
        value={c["role:manager"] ?? 0}
        hint="Counted as staff for engagement"
      />
      <Kpi
        title="Cleaner / maintenance accounts"
        value={(c["role:cleaner"] ?? 0) + (c["role:maintenance"] ?? 0)}
      />
      <Kpi
        title="Operational worker profiles"
        value={c.workerProfiles ?? 0}
        hint="Separate records; overlaps login accounts"
      />
      {!company && (
        <Kpi
          title="Client portal identities"
          value={c.clientIdentities ?? 0}
          hint="Global login identity records"
        />
      )}
      <Kpi
        title="Client relationships"
        value={c.clientRelationships ?? 0}
        hint="Company records; not unique people"
      />
      {!company && (
        <Kpi
          title="All login accounts"
          value={c.loginAccounts ?? 0}
          hint={`${c["role:affiliate"] ?? 0} affiliates included; clients separate`}
        />
      )}
    </div>
  );
}
function PlatformReport({
  section,
}: {
  section: "overview" | "engagement" | "billing";
}) {
  const state = useReport(),
    c = state.report?.counts;
  return (
    <div className="space-y-6">
      <ReportState state={state} />
      {c && (
        <>
          {section === "overview" && (
            <>
              <h2 className="flex items-center gap-2 font-semibold text-gray-900">
                <Building2 className="h-5 w-5 text-primary-600" />
                Platform populations
              </h2>
              <Population counts={c} />
              <JobSummary counts={c} />
              <TopCompanies companies={state.report!.topCompanies} />
            </>
          )}
          {section !== "billing" && (
            <EngagementSummary report={state.report!} />
          )}
          {section !== "engagement" && <BillingSummary counts={c} />}
          <DataQuality counts={c} />
        </>
      )}
      {section === "overview" && !c && !state.error && <TopCompanies />}
    </div>
  );
}
export function TopCompanies({
  companies,
}: {
  companies?: Report["topCompanies"];
}) {
  return (
    <section className="card space-y-4">
      <h2 className="flex items-center gap-2 font-semibold text-gray-900">
        <Building2 className="h-5 w-5 text-primary-600" />
        Top Companies by Jobs
      </h2>
      <p className="text-xs text-gray-600">
        Top 10 by total persisted canonical jobs, all time. All companies,
        including QA/internal, are eligible. Partner copies are excluded;
        automated originals count once. Equal counts sort by company name, then
        ID.
      </p>
      {companies === undefined ? (
        <p role="status" className="text-sm text-gray-600">
          Calculating company ranking…
        </p>
      ) : companies.length === 0 ? (
        <p className="text-sm text-gray-600">No canonical jobs found.</p>
      ) : (
        <ol className="divide-y divide-gray-100">
          {companies.map((company, index) => (
            <li key={company.id}>
              <Link
                href={`/admin/companies/${company.id}`}
                className="flex min-h-11 items-center justify-between gap-4 rounded-lg py-3 text-sm hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600"
              >
                <span className="min-w-0 break-words font-medium text-primary-700">
                  <span className="mr-3 text-gray-500">{index + 1}.</span>
                  {company.name}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-gray-900">
                  {number(company.count)} {company.count === 1 ? "job" : "jobs"}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
export function JobSummary({ counts: c }: { counts: Counts }) {
  return (
    <section className="card space-y-4">
      <h2 className="font-semibold text-gray-900">Job activity</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">
            Canonical jobs in rolling UTC windows
          </caption>
          <thead>
            <tr className="border-b border-gray-200 text-gray-600">
              <th className="py-3">Evidence</th>
              <th>168 hours</th>
              <th>720 hours</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Created", "created"],
              ["Scheduled (UTC date proxy)", "scheduled"],
              ["Completed timestamp", "completed"],
              ["Approved timestamp", "approved"],
              ["Cancelled timestamp", "cancelled"],
              ["Partner copies created (separate)", "sharedCreated"],
            ].map(([label, key]) => (
              <tr key={key} className="border-b border-gray-100">
                <th scope="row" className="py-3 pr-3 font-medium text-gray-700">
                  {label}
                </th>
                <td>{number(c[`${key}7d`] ?? 0)}</td>
                <td>{number(c[`${key}30d`] ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-relaxed text-gray-600">
        {number(c.jobRecords ?? 0)} persisted records ·{" "}
        {number(c.sharedCopies ?? 0)} partner copies ·{" "}
        {number(c.automatedJobs ?? 0)} marked calendar/commercial automation.
        Main windows exclude partner copies; automation is included once.
        Scheduled dates use midnight UTC because dates have no time; cancelled
        records are excluded from scheduled volume. Completion and approval use
        their own timestamps. Counts describe persisted records, not deleted
        history or repeat lifecycle events.
      </p>
    </section>
  );
}
export function EngagementSummary({ report }: { report: Report }) {
  return (
    <section className="card space-y-4">
      <h2 className="flex items-center gap-2 font-semibold text-gray-900">
        <Activity className="h-5 w-5 text-primary-600" />
        Owner & staff engagement
      </h2>
      <p className="text-sm text-gray-600">
        Visible authenticated app access, including read-only visits. Managers,
        cleaners and maintenance are staff. Login, assignments and operational
        writes are different evidence.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {[7, 30].map((days) => (
          <div key={days} className="rounded-xl border border-gray-200 p-4">
            <h3 className="mb-3 text-sm font-semibold">
              Rolling {days === 7 ? "168" : "720"} hours
            </h3>
            <dl className="space-y-2">
              {[
                "Both active",
                "Owner-only",
                "Staff-only",
                "Neither",
                "Insufficient observation",
              ].map((label) => (
                <div key={label} className="flex justify-between gap-4 text-sm">
                  <dt className="text-gray-600">{label}</dt>
                  <dd className="font-semibold text-gray-900">
                    {number(report.counts[`engagement${days}:${label}`] ?? 0)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <Notice>
        Observation definition v1 started: {utc(report.observationStart)}. A
        company needs a full window after the later of this start and company
        creation before receiving a category. No historical backfill or invented
        trends.
      </Notice>
    </section>
  );
}
export function BillingSummary({ counts: c }: { counts: Counts }) {
  return (
    <section className="card space-y-4">
      <h2 className="font-semibold text-gray-900">Billing & access evidence</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-700">
            Stored plan
          </h3>
          <dl className="space-y-2">
            {[
              "Solo",
              "Team",
              "Pro",
              "Legacy cleaning owner",
              "Legacy STR owner",
              "Unknown / unset",
            ].map((plan) => (
              <div key={plan} className="flex justify-between gap-4 text-sm">
                <dt>{plan}</dt>
                <dd className="font-semibold">
                  {number(c[`plan:${plan}`] ?? 0)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-700">
            Overlapping evidence
          </h3>
          <dl className="space-y-2">
            {[
              ["Trial status", "trial"],
              ["Promotion observed", "promotion"],
              ["Promotion unknown", "promotionUnknown"],
              ["Complimentary entitlement", "complimentary"],
              ["Cancellation recorded", "cancellation"],
              ["Payment unverified", "paymentUnverified"],
            ].map(([label, key]) => (
              <div key={key} className="flex justify-between gap-4 text-sm">
                <dt>{label}</dt>
                <dd className="font-semibold">{number(c[key] ?? 0)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {Object.entries(c)
          .filter(([key]) => key.startsWith("subscription:"))
          .map(([key, count]) => (
            <Status key={key}>
              {key.slice(13)}: {number(count)}
            </Status>
          ))}
      </div>
      <p className="text-xs leading-relaxed text-gray-600">
        Stored subscription status is not proof of payment. Promotion evidence
        comes from the last available subscription snapshot; snapshots older
        than 24 hours are stale. Missing plan data stays unknown. No Stripe
        calls or billing changes are made.
      </p>
    </section>
  );
}
function DataQuality({ counts: c }: { counts: Counts }) {
  return (
    <details className="card">
      <summary className="cursor-pointer py-1 font-semibold text-gray-900">
        Data quality & metric definitions
      </summary>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        {[
          ["Missing worker profiles", "missingWorkerProfiles"],
          ["Accounts with duplicate profiles", "duplicateWorkerProfiles"],
          ["Accounts with foreign profiles", "foreignWorkerProfiles"],
          ["Relationships without portal login", "relationshipsWithoutLogin"],
          [
            "Approved jobs missing completion time",
            "approvedMissingCompletion",
          ],
          ["Approved jobs missing approval time", "approvedMissingApproval"],
          [
            "Cancelled jobs missing cancellation time",
            "cancelledMissingTimestamp",
          ],
          ["Missing / stale billing snapshots", "staleBilling"],
        ].map(([label, key]) => (
          <div key={key} className="flex justify-between gap-3">
            <dt className="text-gray-600">{label}</dt>
            <dd className="font-semibold">{number(c[key] ?? 0)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs leading-relaxed text-gray-600">
        All account/profile/relationship statuses are included. Overlapping
        populations are never added together. Relationships count records,
        including duplicates, not unique customers. “Neither” requires complete
        observation coverage. Rolling timestamp windows use (start, end] in UTC.
        Last-seen is throttled to five-minute observations and may lag
        foreground use.
      </p>
    </details>
  );
}
function Pager({
  cursors,
  setCursors,
  result,
}: {
  cursors: (string | null)[];
  setCursors: (value: (string | null)[]) => void;
  result?: { isDone: boolean; continueCursor: string };
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        className="btn-secondary min-h-11"
        disabled={cursors.length === 1}
        onClick={() => setCursors(cursors.slice(0, -1))}
      >
        Previous
      </button>
      <span className="text-sm text-gray-600">Page {cursors.length}</span>
      <button
        type="button"
        className="btn-secondary min-h-11"
        disabled={!result || result.isDone}
        onClick={() =>
          result && setCursors([...cursors, result.continueCursor])
        }
      >
        Next
      </button>
    </div>
  );
}
function CompanyDirectory() {
  const { user, sessionToken } = useAuth();
  const [readKey, setReadKey] = useState(() => crypto.randomUUID());
  const [search, setSearch] = useState(""),
    [submitted, setSubmitted] = useState("");
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const result = useQuery(
    api.adminHubData.companies,
    user?.isSuperadmin && sessionToken
      ? {
          userId: user._id,
          sessionToken,
          search: submitted,
          readKey,
          paginationOpts: { numItems: 10, cursor: cursors[cursors.length - 1] },
        }
      : "skip",
  );
  return (
    <section className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(search.trim());
          setCursors([null]);
          setReadKey(crypto.randomUUID());
        }}
        className="card flex flex-col gap-3 sm:flex-row"
      >
        <label className="flex-1 text-sm font-medium text-gray-700">
          Company name
          <input
            className="input mt-1 w-full"
            value={search}
            maxLength={100}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company name…"
          />
        </label>
        <button className="btn-primary min-h-11 self-end" type="submit">
          Search
        </button>
        <button
          className="btn-secondary min-h-11 self-end"
          type="button"
          onClick={() => {
            setReadKey(crypto.randomUUID());
            setCursors([null]);
          }}
        >
          Refresh directory
        </button>
      </form>
      <p className="text-xs text-gray-600">
        All companies included. Name search matches indexed words and prefixes.
        Counts load per company in bounded pages.
      </p>
      {!result ? (
        <p role="status" className="card">
          Loading companies…
        </p>
      ) : result.page.length === 0 ? (
        <div className="card text-sm text-gray-600">
          No companies match this search.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {result.page.map((company) => (
            <CompanyRow key={`${company.id}:${readKey}`} company={company} />
          ))}
        </div>
      )}
      <Pager cursors={cursors} setCursors={setCursors} result={result} />
    </section>
  );
}
function CompanyRow({ company }: { company: Company }) {
  const state = useReport(company.id),
    c = state.report?.counts;
  return (
    <article className="card space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/admin/companies/${company.id}`}
            className="break-words text-lg font-semibold text-primary-700 hover:underline"
          >
            {company.name}
          </Link>
          {company.contactEmail && (
            <p className="break-all text-sm text-gray-600">
              {company.contactEmail}
            </p>
          )}
        </div>
        {company.qa && <Status>QA fixture</Status>}
      </div>
      <BillingBadges company={company} />
      <ul className="space-y-1 text-sm text-gray-600">
        {company.ownerContacts.map((owner, index) => (
          <li className="break-all" key={`${owner.email}:${index}`}>
            {owner.name} · {owner.email}
          </li>
        ))}
      </ul>
      {c ? (
        <>
          <p className="text-sm text-gray-700">
            Owners {c["role:owner"] ?? 0} · Managers {c["role:manager"] ?? 0} ·
            Workers {(c["role:cleaner"] ?? 0) + (c["role:maintenance"] ?? 0)} ·
            Client relationships {c.clientRelationships ?? 0}
          </p>
          <p className="text-sm text-gray-600">
            Canonical jobs created: {c.created7d ?? 0} / {c.created30d ?? 0} (7
            / 30 days)
          </p>
          {!c.staffAccounts && <Status>No staff accounts</Status>}
        </>
      ) : (
        <p role="status" className="text-sm text-gray-600">
          {state.error || "Loading company counts…"}
          {state.error && (
            <button className="ml-2 underline" onClick={state.refresh}>
              Retry
            </button>
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Status>7d: {company.engagement7}</Status>
        <Status>30d: {company.engagement30}</Status>
      </div>
      <p className="text-xs text-gray-600">
        Engagement read: {utc(company.measuredAt)}
      </p>
      <Link
        href={`/admin/companies/${company.id}`}
        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary-700"
      >
        People, emails & evidence
        <ArrowRight className="h-4 w-4" />
      </Link>
    </article>
  );
}
export function BillingBadges({ company }: { company: Company }) {
  const b = company.billing;
  return (
    <div className="flex flex-wrap gap-2">
      <Status>{b.plan}</Status>
      <Status>{b.status}</Status>
      {b.complimentary && <Status>Complimentary</Status>}
      {b.trial && <Status>Trial</Status>}
      {b.promotion === true && <Status>Promotion observed</Status>}
      {b.promotion === null && <Status>Promotion unknown</Status>}
      {b.cancellation && <Status>Cancellation recorded</Status>}
      <Status>Payment unverified</Status>
      {b.stale && <Status>Billing evidence stale / missing</Status>}
    </div>
  );
}
function CompanyDetail({ companyId }: { companyId: Id<"companies"> }) {
  const { user, sessionToken } = useAuth();
  const [readKey, setReadKey] = useState(() => crypto.randomUUID());
  const company = useQuery(
    api.adminHubData.company,
    user?.isSuperadmin && sessionToken
      ? { userId: user._id, sessionToken, companyId, readKey }
      : "skip",
  );
  const state = useReport(companyId),
    c = state.report?.counts;
  if (company === undefined) return <PageLoader />;
  if (company === null)
    return (
      <Notice>
        Company not found.{" "}
        <Link href="/admin/companies" className="underline">
          Back to companies
        </Link>
      </Notice>
    );
  return (
    <div className="space-y-6">
      <PageHeader
        title={company.name}
        description={`Created ${utc(company.createdAt)}`}
        back={{ href: "/admin/companies", label: "All companies" }}
      />
      <section className="card space-y-3">
        <BillingBadges company={company} />
        {company.qa && <Status>Marked QA fixture · included in totals</Status>}
        <p className="break-all text-sm text-gray-700">
          Company contact: {company.contactEmail ?? "Not recorded"}
        </p>
        <p className="text-xs text-gray-600">
          Billing snapshot:{" "}
          {company.billing.snapshotAt === null
            ? "Not available"
            : utc(company.billing.snapshotAt)}
          . Status and snapshot evidence may have different freshness.
        </p>
        <p className="text-xs text-gray-600">
          Snapshot trial end:{" "}
          {company.billing.trialEnd === null
            ? "Unknown"
            : utc(company.billing.trialEnd)}
          {" · "}Awarded access through:{" "}
          {company.billing.awardedUntil === null
            ? "Not recorded"
            : utc(company.billing.awardedUntil)}
        </p>
      </section>
      <ReportState
        state={{
          ...state,
          refresh: () => {
            state.refresh();
            setReadKey(crypto.randomUUID());
          },
        }}
      />
      {c && (
        <>
          <Population counts={c} company />
          {!c.staffAccounts && (
            <Notice>
              No staff accounts. Owner-only access is expected for a solo
              company and is not evidence of poor staff adoption.
            </Notice>
          )}
          <JobSummary counts={c} />
        </>
      )}
      <section className="card space-y-3">
        <h2 className="font-semibold text-gray-900">
          Foreground access evidence
        </h2>
        <p className="text-xs text-gray-600">
          Engagement read: {utc(company.measuredAt)}. Refresh report to update
          the time boundary.
        </p>
        <div className="flex flex-wrap gap-2">
          <Status>7d: {company.engagement7}</Status>
          <Status>30d: {company.engagement30}</Status>
        </div>
        <p className="text-sm text-gray-600">
          Owner last seen: {utc(company.ownerLastSeen)}
        </p>
        <p className="text-sm text-gray-600">
          Staff last seen: {utc(company.staffLastSeen)}
        </p>
        <p className="text-xs text-gray-600">
          Coverage begins {utc(company.coverageStart)}. Role/company attribution
          is preserved at observation time. Last-seen is observed, not
          continuous tracking.
        </p>
      </section>
      <CompanyPeople companyId={companyId} />
      {c && <DataQuality counts={c} />}
      <p className="text-xs text-gray-600">
        Cross-company operational access is not granted here. Tenant tools
        continue to require their normal company and role permissions.
      </p>
    </div>
  );
}
function CompanyPeople({ companyId }: { companyId: Id<"companies"> }) {
  const { user, sessionToken } = useAuth();
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const result = useQuery(
    api.adminHubData.people,
    user?.isSuperadmin && sessionToken
      ? {
          userId: user._id,
          sessionToken,
          companyId,
          paginationOpts: { numItems: 25, cursor: cursors[cursors.length - 1] },
        }
      : "skip",
  );
  return (
    <section className="card space-y-4">
      <h2 className="flex items-center gap-2 font-semibold text-gray-900">
        <Users className="h-5 w-5 text-primary-600" />
        People & contact emails
      </h2>
      {!result ? (
        <p role="status">Loading people…</p>
      ) : !result.page.length ? (
        <p className="text-sm text-gray-600">
          No login accounts in this company.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {result.page.map((person) => (
            <li
              key={person.id}
              className="flex flex-col justify-between gap-2 py-3 sm:flex-row"
            >
              <div className="min-w-0">
                <p className="font-medium text-gray-900">{person.name}</p>
                <a
                  className="break-all text-sm text-primary-700 underline"
                  href={`mailto:${person.email}`}
                >
                  {person.email}
                </a>
              </div>
              <div className="flex items-center gap-2">
                <Status>{person.role}</Status>
                <Status>{person.status}</Status>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pager cursors={cursors} setCursors={setCursors} result={result} />
    </section>
  );
}
