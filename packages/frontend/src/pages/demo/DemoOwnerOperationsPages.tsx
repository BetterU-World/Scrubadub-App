import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import {
  Archive,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  DollarSign,
  FileText,
  Globe,
  List,
  MapPin,
  Plus,
  Search,
  Sparkles,
  Tags,
  Upload,
  Users,
} from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { DemoShell } from "../../demo/DemoShell";
import { buildShowcasePath } from "../../demo/showcaseRegistry";
import { brightSideWorkerJobs } from "../../demo/fixtures/workerShowcaseFixtures";
import {
  getShowcaseClient,
  getShowcaseCommercialAccount,
  getShowcaseOwnerRequest,
  getShowcaseProperty,
  getShowcasePropertyOperations,
  getShowcaseRequestWorkflow,
  getShowcaseWorker,
  showcaseAnalytics,
  showcaseClients,
  showcaseCommercialAccounts,
  showcaseInvoices,
  showcaseOwnerRequests,
  showcaseProperties,
  showcaseSchedule,
  showcaseWorkers,
  showcaseWorkspace,
} from "../../demo/fixtures/operationsShowcaseFixtures";

const ownerPath = (path: string, presentation: boolean) =>
  buildShowcasePath("owner", path, presentation);
const showcaseJobRouteId = (id: string) =>
  id === "job-future"
    ? "linden-standard"
    : id === "job-complete"
      ? "sunroom-approved"
      : id;
const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);

function Frame({
  eyebrow = "BrightSide Cleaning Co.",
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary-700">
          {eyebrow}
        </p>
        <h1 className="mt-2 break-words text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl">
          {title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-600 sm:text-base">
          {description}
        </p>
      </header>
      {children}
    </div>
  );
}
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-4 py-4 sm:px-5">
        <h2 className="font-semibold text-gray-900">{title}</h2>
      </div>
      {children}
    </section>
  );
}
function Status({
  children,
  tone = "green",
}: {
  children: ReactNode;
  tone?: "green" | "blue" | "amber" | "gray";
}) {
  const tones = {
    green: "bg-green-100 text-green-800",
    blue: "bg-blue-100 text-blue-800",
    amber: "bg-amber-100 text-amber-800",
    gray: "bg-gray-100 text-gray-700",
  };
  return <span className={`badge ${tones[tone]}`}>{children}</span>;
}
function DetailLink({
  href,
  presentation,
  children,
}: {
  href: string;
  presentation: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={ownerPath(href, presentation)}
      className="font-medium text-primary-700 outline-none hover:text-primary-800 focus-visible:ring-2 focus-visible:ring-primary-500"
    >
      {children}
    </Link>
  );
}
function DemoAction({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      disabled
      title="Read only in Showcase"
      className="btn-primary flex w-full items-center justify-center gap-2 opacity-70 sm:w-auto"
    >
      {children}
    </button>
  );
}
function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="relative block min-w-0 flex-1">
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="input-field pl-9"
      />
    </label>
  );
}

export function DemoOwnerOperationsPage({
  page,
  presentation,
  currentPath,
}: {
  page: string;
  presentation: boolean;
  currentPath: string;
}) {
  let content: ReactNode;
  if (page === "/properties")
    content = <Properties presentation={presentation} />;
  else if (page === "/employees")
    content = <Team presentation={presentation} />;
  else if (page === "/calendar")
    content = <Calendar presentation={presentation} />;
  else if (page === "/requests")
    content = <Requests presentation={presentation} />;
  else if (page === "/clients")
    content = <Clients presentation={presentation} />;
  else if (page === "/commercial-accounts")
    content = <Commercial presentation={presentation} />;
  else if (page === "/commercial-invoices" || page === "/financials")
    content = <Financials />;
  else if (page === "/analytics") content = <Analytics />;
  else content = <Settings />;
  return (
    <DemoShell presentation={presentation} currentPath={currentPath}>
      {content}
    </DemoShell>
  );
}

function Properties({ presentation }: { presentation: boolean }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const items = showcaseProperties.filter((item) =>
    `${item.name} ${item.address} ${item.client}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const toggle = (id: string) =>
    setSelected((value) =>
      value.includes(id) ? value.filter((x) => x !== id) : [...value, id],
    );
  return (
    <div>
      <PageHeader
        title="Properties"
        description="Manage properties and their inventory."
        action={
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button
              disabled
              className="btn-secondary flex items-center justify-center gap-2 opacity-70"
            >
              <Upload className="h-4 w-4" />
              Import
            </button>
            <DemoAction>
              <Plus className="h-4 w-4" />
              Add Property
            </DemoAction>
          </div>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search properties"
        />
        <span className="self-center text-sm text-gray-500">
          {items.length} active properties
        </span>
      </div>
      {selected.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border bg-gray-50 p-3">
          <span className="text-sm font-medium">
            {selected.length} selected
          </span>
          <button disabled className="btn-secondary text-sm opacity-70">
            Archive
          </button>
          <button
            onClick={() => setSelected([])}
            className="text-sm text-gray-500"
          >
            Deselect all
          </button>
        </div>
      )}
      <label className="mb-3 flex items-center gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          checked={items.length > 0 && selected.length === items.length}
          onChange={() =>
            setSelected(
              selected.length === items.length ? [] : items.map((x) => x.id),
            )
          }
        />
        Select all
      </label>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div key={item.id} className="relative">
            <label className="absolute left-3 top-3 z-10">
              <input
                type="checkbox"
                checked={selected.includes(item.id)}
                onChange={() => toggle(item.id)}
              />
            </label>
            <Link
              href={ownerPath(`/properties/${item.id}`, presentation)}
              className={`card block pl-10 ${selected.includes(item.id) ? "ring-2 ring-primary-300 bg-primary-50/30" : ""}`}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <h2 className="font-semibold">{item.name}</h2>
                <StatusBadge status={item.active ? "active" : "inactive"} />
              </div>
              <p className="mb-1 flex items-start gap-1 text-sm text-gray-500">
                <MapPin className="mt-0.5 h-3.5 w-3.5 flex-none" />
                {item.address}
              </p>
              <p className="text-sm capitalize text-gray-500">
                {item.type.replace(/_/g, " ")} · {item.bedrooms} beds /{" "}
                {item.baths} baths
              </p>
              <div className="mt-3 flex flex-wrap gap-1">
                {item.amenities.slice(0, 3).map((value) => (
                  <span key={value} className="badge bg-gray-100 text-gray-600">
                    {value}
                  </span>
                ))}
                {item.amenities.length > 3 && (
                  <span className="badge bg-gray-100 text-gray-600">
                    +{item.amenities.length - 3}
                  </span>
                )}
              </div>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
function Team({ presentation }: { presentation: boolean }) {
  const [query, setQuery] = useState("");
  const items = showcaseWorkers.filter((x) =>
    `${x.name} ${x.role} ${x.team}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div>
      <PageHeader
        title="Team"
        description="Invite workers and manage operational roles, onboarding, and eligibility."
        action={
          <DemoAction>
            <Plus className="h-4 w-4" />
            Invite Employee
          </DemoAction>
        }
      />
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_12rem_auto]">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search team"
        />
        <select className="input-field">
          <option>All roles</option>
          <option>Cleaner</option>
          <option>Maintenance</option>
        </select>
        <button className="btn-secondary" disabled>
          Filter
        </button>
      </div>
      <div className="overflow-hidden rounded-xl border bg-white">
        <table className="block w-full sm:table">
          <thead className="hidden bg-gray-50 sm:table-header-group">
            <tr>
              {[
                "Employee",
                "Role",
                "Worker type",
                "Onboarding",
                "Eligibility",
                "Status",
                "",
              ].map((x) => (
                <th
                  key={x}
                  className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500"
                >
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="block space-y-3 p-3 sm:table-row-group sm:space-y-0 sm:p-0">
            {items.map((worker) => (
              <tr
                key={worker.id}
                className="block rounded-lg border p-4 sm:table-row sm:rounded-none sm:border-0 sm:border-b"
              >
                <td className="block font-medium sm:table-cell sm:px-4 sm:py-3">
                  {worker.name}
                  <span className="block text-xs text-gray-500">
                    {worker.team}
                  </span>
                </td>
                <td className="block pt-2 text-sm sm:table-cell sm:px-4 sm:py-3">
                  {worker.role}
                </td>
                <td className="block pt-2 text-sm sm:table-cell sm:px-4 sm:py-3">
                  {worker.role.includes("Maintenance")
                    ? "1099 contractor"
                    : "W-2 employee"}
                </td>
                <td className="block pt-2 sm:table-cell sm:px-4 sm:py-3">
                  <StatusBadge
                    status={worker.id === "elena" ? "pending" : "approved"}
                  />
                </td>
                <td className="block pt-2 text-sm text-green-700 sm:table-cell sm:px-4 sm:py-3">
                  Eligible
                </td>
                <td className="block pt-2 sm:table-cell sm:px-4 sm:py-3">
                  <StatusBadge status="active" />
                </td>
                <td className="mt-3 block border-t pt-3 sm:table-cell sm:border-0 sm:px-4 sm:py-3">
                  <DetailLink
                    href={`/employees/${worker.id}`}
                    presentation={presentation}
                  >
                    View
                  </DetailLink>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function Calendar({ presentation }: { presentation: boolean }) {
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [offset, setOffset] = useState(0);
  const days = Array.from({ length: 35 }, (_, i) => i - 5);
  const jobsByDay: Record<number, (typeof showcaseSchedule)[number][]> = {
    2: showcaseSchedule.slice(0, 2),
    3: showcaseSchedule.slice(2),
    17: [showcaseSchedule[1]],
    24: [showcaseSchedule[0]],
  };
  return (
    <div>
      <PageHeader
        title="Calendar"
        description="View and coordinate scheduled work across properties and teams."
      />
      <div className="mb-4 flex flex-col gap-3 rounded-xl border bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setOffset((x) => x - 1)}
            aria-label="Previous period"
            className="touch-target rounded-lg border"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setOffset(0)}
            className="btn-secondary text-sm"
          >
            Today
          </button>
          <button
            onClick={() => setOffset((x) => x + 1)}
            aria-label="Next period"
            className="touch-target rounded-lg border"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <h2 className="ml-2 font-semibold">
            {offset === 0
              ? "August 2026"
              : offset < 0
                ? "July 2026"
                : "September 2026"}
          </h2>
        </div>
        <div className="grid grid-cols-3 overflow-hidden rounded-lg border">
          {(["month", "week", "day"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setView(mode)}
              className={`touch-target px-3 text-sm capitalize ${view === mode ? "bg-primary-50 text-primary-700" : "text-gray-600"}`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
      {view === "month" ? (
        <div className="overflow-hidden rounded-lg border bg-gray-200">
          <div className="grid grid-cols-7 gap-px">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div
                key={day}
                className="bg-gray-50 p-2 text-center text-xs font-medium text-gray-500"
              >
                {day}
              </div>
            ))}
            {days.map((day, index) => (
              <div
                key={index}
                className="min-h-24 min-w-0 bg-white p-1.5 sm:min-h-32 sm:p-2"
              >
                <span
                  className={`text-xs ${day < 1 ? "text-gray-300" : "text-gray-600"}`}
                >
                  {day < 1 ? 31 + day : day}
                </span>
                <div className="mt-1 space-y-1">
                  {day > 0 &&
                    (jobsByDay[day] ?? []).map((job) => (
                      <Link
                        key={job.id}
                        href={ownerPath("/jobs", presentation)}
                        className={`block min-w-0 truncate rounded px-1.5 py-1 text-[10px] sm:text-xs ${job.status === "in_progress" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"}`}
                      >
                        {job.startTime} {job.propertyName}
                      </Link>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-white">
          <div className="divide-y">
            {showcaseSchedule.slice(0, view === "day" ? 2 : 4).map((job) => (
              <div
                key={job.id}
                className="grid gap-2 p-4 sm:grid-cols-[8rem_1fr_auto]"
              >
                <span className="font-medium">
                  {job.dateLabel} · {job.startTime}
                </span>
                <div>
                  <p className="font-medium">{job.propertyName}</p>
                  <p className="text-sm text-gray-500">
                    {job.worker} · {job.client}
                  </p>
                </div>
                <StatusBadge status={job.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
function Requests({ presentation }: { presentation: boolean }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const items = showcaseOwnerRequests.filter(
    (x) =>
      (filter === "all" || x.status === filter) &&
      `${x.client} ${x.property} ${x.service}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track prospect requests separately from authenticated client job
            requests.
          </p>
        </div>
        <div className="grid grid-cols-2 overflow-hidden rounded-lg border">
          <button className="touch-target flex items-center justify-center gap-2 bg-primary-50 px-3 text-primary-700">
            <List className="h-4 w-4" />
            List
          </button>
          <button disabled className="touch-target px-3 text-gray-500">
            Pipeline
          </button>
        </div>
      </div>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {["all", "submitted", "scheduled", "completed", "declined"].map(
          (value) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`touch-target flex-none rounded-full px-4 text-sm capitalize ${filter === value ? "bg-primary-600 text-white" : "border bg-white text-gray-600"}`}
            >
              {value}
            </button>
          ),
        )}
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search leads"
        />
        <DemoAction>
          <Plus className="h-4 w-4" />
          New Lead
        </DemoAction>
      </div>
      <div className="grid gap-3">
        {items.map((request) => (
          <Link
            key={request.id}
            href={ownerPath(`/requests/${request.id}`, presentation)}
            className="card block"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{request.client}</h2>
                  <StatusBadge status={request.status} />
                </div>
                <p className="mt-2 flex items-start gap-1 text-sm text-gray-500">
                  <MapPin className="mt-0.5 h-4 w-4 flex-none" />
                  {request.property}
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  {request.service} · requested {request.requestedDate}
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <span className="block text-xs text-gray-500">Source</span>
                Client request
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
function Clients({ presentation }: { presentation: boolean }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const items = showcaseClients.filter(
    (x) =>
      (status === "all" || x.status === status) &&
      `${x.name} ${x.business} ${x.email}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div>
      <PageHeader
        title="Clients"
        description="Manage client relationships, contacts, and connected service locations."
        action={
          <DemoAction>
            <Plus className="h-4 w-4" />
            New Client
          </DemoAction>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search clients"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="input-field"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <div className="grid gap-3">
        {items.map((client) => (
          <Link
            key={client.id}
            href={ownerPath(`/clients/${client.id}`, presentation)}
            className="card block hover:border-primary-200 hover:bg-primary-50/30"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{client.name}</h2>
                  <span className="badge bg-gray-100 capitalize text-gray-700">
                    {client.type.replace(/_/g, " ")}
                  </span>
                  <StatusBadge status={client.status} />
                </div>
                <div className="mt-2 grid gap-1 text-sm text-gray-500 sm:grid-cols-2">
                  <span>{client.business}</span>
                  <span>{client.services}</span>
                  <span className="break-all">{client.email}</span>
                  <span>{client.phone}</span>
                  <span>{client.locations} connected locations</span>
                </div>
              </div>
              <span className="text-xs text-gray-400">
                Updated {client.updated}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
function Commercial({ presentation }: { presentation: boolean }) {
  const [status, setStatus] = useState("all");
  const items = showcaseCommercialAccounts.filter(
    (x) => status === "all" || x.status.toLowerCase() === status,
  );
  return (
    <div>
      <PageHeader
        title="Commercial Accounts"
        description="Manage recurring commercial relationships, locations, agreements, and billing."
        action={
          <DemoAction>
            <Plus className="h-4 w-4" />
            New Account
          </DemoAction>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-2 sm:flex">
        {["all", "active", "inactive"].map((value) => (
          <button
            key={value}
            onClick={() => setStatus(value)}
            className={`touch-target rounded-lg px-4 text-sm capitalize ${status === value ? "bg-primary-600 text-white" : "border bg-white"}`}
          >
            {value}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border bg-white">
        <table className="block w-full sm:table">
          <thead className="hidden bg-gray-50 sm:table-header-group">
            <tr>
              {[
                "Account",
                "Status",
                "Primary contact",
                "Locations",
                "Cadence",
                "Next service",
                "Monthly value",
              ].map((x) => (
                <th
                  key={x}
                  className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500"
                >
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="block space-y-3 p-3 sm:table-row-group sm:p-0">
            {items.map((account) => (
              <tr
                key={account.id}
                className="block rounded-lg border p-4 sm:table-row sm:border-0 sm:border-b"
              >
                <td className="block pb-3 sm:table-cell sm:px-4 sm:py-3">
                  <DetailLink
                    href={`/commercial-accounts/${account.id}`}
                    presentation={presentation}
                  >
                    {account.name}
                  </DetailLink>
                  <span className="block text-xs text-gray-500">
                    {account.location}
                  </span>
                </td>
                <td className="block py-1 sm:table-cell sm:px-4 sm:py-3">
                  <StatusBadge status={account.status.toLowerCase()} />
                </td>
                <td className="block py-1 text-sm sm:table-cell sm:px-4 sm:py-3">
                  {account.contact}
                </td>
                <td className="block py-1 text-sm sm:table-cell sm:px-4 sm:py-3">
                  1 active
                </td>
                <td className="block py-1 text-sm sm:table-cell sm:px-4 sm:py-3">
                  {account.cadence}
                </td>
                <td className="block py-1 text-sm sm:table-cell sm:px-4 sm:py-3">
                  {account.nextService}
                </td>
                <td className="block pt-3 font-semibold sm:table-cell sm:px-4 sm:py-3">
                  {money(account.monthlyValueCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function Financials() {
  const total = showcaseInvoices.reduce(
    (sum, item) => sum + item.totalCents,
    0,
  );
  return (
    <Frame
      title="Financial overview"
      description="Representative BrightSide invoices only—no live payment processing is connected."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Invoice total", money(total), DollarSign],
          [
            "Paid",
            money(
              showcaseInvoices
                .filter((x) => x.status === "paid")
                .reduce((s, x) => s + x.totalCents, 0),
            ),
            CheckCircle2,
          ],
          [
            "Outstanding",
            money(
              showcaseInvoices
                .filter((x) => x.status !== "paid")
                .reduce((s, x) => s + x.totalCents, 0),
            ),
            Clock3,
          ],
        ].map(([label, value, Icon]) => {
          const TileIcon = Icon as typeof DollarSign;
          return (
            <div
              key={String(label)}
              className="rounded-2xl border border-gray-200 bg-white p-5"
            >
              <TileIcon className="h-5 w-5 text-primary-600" />
              <p className="mt-3 text-2xl font-bold">{String(value)}</p>
              <p className="text-sm text-gray-500">{String(label)}</p>
            </div>
          );
        })}
      </div>
      <Panel title="Invoices">
        <div className="divide-y divide-gray-100">
          {showcaseInvoices.map((invoice) => (
            <article
              key={invoice._id}
              className="grid gap-2 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_8rem_7rem_auto] sm:items-center sm:px-5"
            >
              <div>
                <p className="font-medium">{invoice.title}</p>
                <p className="text-sm text-gray-500">
                  {invoice.invoiceNumber} · {invoice.client}
                </p>
              </div>
              <p className="text-sm">Due {invoice.dueDate}</p>
              <p className="font-semibold">{money(invoice.totalCents)}</p>
              <Status tone={invoice.status === "paid" ? "green" : "amber"}>
                {invoice.status}
              </Status>
            </article>
          ))}
        </div>
      </Panel>
    </Frame>
  );
}
function Analytics() {
  const max = Math.max(...showcaseAnalytics.weeklyJobs);
  return (
    <Frame
      title="Analytics"
      description="Operational signals for the fictional BrightSide workspace, not platform-wide claims."
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {showcaseAnalytics.metrics.map(([label, value, note]) => (
          <article
            key={label}
            className="rounded-2xl border border-gray-200 bg-white p-5"
          >
            <BarChart3 className="h-5 w-5 text-primary-600" />
            <p className="mt-4 text-2xl font-bold">{value}</p>
            <h2 className="text-sm font-medium">{label}</h2>
            <p className="mt-2 text-xs text-gray-500">{note}</p>
          </article>
        ))}
      </div>
      <Panel title="Completed jobs by week">
        <div className="flex h-52 items-end gap-4 px-5 py-6">
          {showcaseAnalytics.weeklyJobs.map((value, index) => (
            <div
              key={index}
              className="flex flex-1 flex-col items-center gap-2"
            >
              <span className="text-sm font-semibold">{value}</span>
              <div
                className="w-full max-w-20 rounded-t-lg bg-primary-500"
                style={{ height: `${Math.round((value / max) * 130)}px` }}
              />
              <span className="text-xs text-gray-500">Week {index + 1}</span>
            </div>
          ))}
        </div>
      </Panel>
    </Frame>
  );
}
function Settings() {
  const groups = [
    {
      title: "Company",
      items: [
        [
          Building2,
          "Company Profile",
          `${showcaseWorkspace.companyName} · ${showcaseWorkspace.serviceArea}`,
        ],
      ],
    },
    {
      title: "Services & Pricing",
      items: [
        [Tags, "Add-ons", "Optional services, pricing, and availability"],
      ],
    },
    {
      title: "Team & Documents",
      items: [
        [FileText, "Documents Hub", "Company documents and templates"],
        [Users, "Workers & Access", "Team roles, permissions, and onboarding"],
      ],
    },
    {
      title: "Billing & Payments",
      items: [
        [DollarSign, "Subscription & Billing", "Plan and billing details"],
        [
          CheckCircle2,
          "Customer Payments",
          "Connected for the fictional workspace",
        ],
      ],
    },
    {
      title: "Preferences & Data",
      items: [
        [Archive, "Archived Properties", "Review inactive service locations"],
        [Bell, "Notifications", "Coming soon"],
        [Globe, "Language", "English"],
      ],
    },
  ] as const;
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage your company profile, services, team access, billing, and preferences."
      />
      <div className="max-w-lg space-y-8">
        {groups.map((group) => (
          <section key={group.title}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              {group.title}
            </h2>
            <div className="space-y-2">
              {group.items.map(([Icon, title, description]) => (
                <div
                  key={title}
                  className={`card flex items-center gap-4 ${title === "Notifications" ? "border-dashed bg-gray-50 opacity-60" : ""}`}
                >
                  <div className="rounded-lg bg-primary-50 p-2 text-primary-600">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{title}</p>
                    <p className="text-sm text-gray-500">{description}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function DemoOwnerDetailPage({
  kind,
  id,
  presentation,
  currentPath,
}: {
  kind: "property" | "employee" | "request" | "client" | "commercial";
  id: string;
  presentation: boolean;
  currentPath: string;
}) {
  const [detailTab, setDetailTab] = useState<
    "overview" | "inventory" | "history"
  >("overview");
  const item =
    kind === "property"
      ? getShowcaseProperty(id)
      : kind === "employee"
        ? getShowcaseWorker(id)
        : kind === "request"
          ? getShowcaseOwnerRequest(id)
          : kind === "client"
            ? getShowcaseClient(id)
            : getShowcaseCommercialAccount(id);
  if (!item)
    return (
      <DemoShell presentation={presentation} currentPath={currentPath}>
        <Frame
          title="Showcase record not found"
          description="This record is not part of the BrightSide fixture story."
        >
          <DetailLink href="/" presentation={presentation}>
            Return to Owner home
          </DetailLink>
        </Frame>
      </DemoShell>
    );
  if ((kind as string) === "property") {
    const property = item as NonNullable<
      ReturnType<typeof getShowcaseProperty>
    >;
    const operations = getShowcasePropertyOperations(id);
    const job = brightSideWorkerJobs.find((x) => x.id === property.jobId);
    return (
      <DemoShell presentation={presentation} currentPath={currentPath}>
        <div>
          <PageHeader
            title={property.name}
            description={`${property.client} · ${property.address}`}
            back={{
              href: ownerPath("/properties", presentation),
              label: "Back to properties",
            }}
            action={<DemoAction>Edit property</DemoAction>}
          />
          <div className="mb-5 flex gap-2 overflow-x-auto border-b">
            {(["overview", "inventory", "history"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setDetailTab(tab)}
                className={`touch-target flex-none border-b-2 px-3 text-sm capitalize ${detailTab === tab ? "border-primary-600 font-semibold text-primary-700" : "border-transparent text-gray-500"}`}
              >
                {tab}
              </button>
            ))}
          </div>
          {detailTab === "overview" ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Property profile">
                <dl className="grid gap-4 p-5 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm text-gray-500">Type</dt>
                    <dd className="font-medium capitalize">
                      {property.type.replace(/_/g, " ")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-500">Cadence</dt>
                    <dd className="font-medium">{property.cadence}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-500">Layout</dt>
                    <dd>
                      {property.bedrooms} beds · {property.baths} baths
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-500">Next service</dt>
                    <dd>{property.nextService}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-sm text-gray-500">Amenities</dt>
                    <dd className="mt-2 flex flex-wrap gap-1">
                      {property.amenities.map((x) => (
                        <span
                          key={x}
                          className="badge bg-gray-100 text-gray-700"
                        >
                          {x}
                        </span>
                      ))}
                    </dd>
                  </div>
                </dl>
              </Panel>
              <Panel title="Access & service instructions">
                <dl className="space-y-4 p-5">
                  <div>
                    <dt className="text-sm text-gray-500">Access</dt>
                    <dd>{operations?.access ?? property.notes}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-500">Parking</dt>
                    <dd>
                      {operations?.parking ??
                        "Confirm with client before arrival."}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-500">Cleaning notes</dt>
                    <dd>{operations?.cleaning ?? property.notes}</dd>
                  </div>
                </dl>
              </Panel>
              <Panel title="Connected client">
                <div className="p-5">
                  <p className="font-medium">{property.client}</p>
                  <p className="mt-1 text-sm text-gray-500">
                    Service history and requests remain connected to this
                    location.
                  </p>
                </div>
              </Panel>
              <Panel title="Upcoming work">
                <div className="p-5">
                  <p className="font-medium">{job?.serviceTypeLabel}</p>
                  <p className="text-sm text-gray-500">
                    {job?.dateLabel} · {job?.startTime}
                  </p>
                  <div className="mt-4">
                    <DetailLink
                      href={`/jobs/${property.jobId}`}
                      presentation={presentation}
                    >
                      Open job schedule →
                    </DetailLink>
                  </div>
                  {operations?.issue && (
                    <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                      Open issue: {operations.issue}
                    </p>
                  )}
                </div>
              </Panel>
            </div>
          ) : detailTab === "inventory" ? (
            <Panel title="Property inventory">
              <div className="p-5">
                <p className="mb-4 text-sm text-gray-500">
                  On-hand counts are compared with this property’s restock
                  targets during each service.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b text-gray-500">
                        <th className="py-2">Category</th>
                        <th>Item</th>
                        <th>On hand</th>
                        <th>Target</th>
                      </tr>
                    </thead>
                    <tbody>
                      {operations?.inventory.map(
                        ([category, name, onHand, target]) => (
                          <tr key={name} className="border-b">
                            <td className="py-3">{category}</td>
                            <td className="font-medium">{name}</td>
                            <td>{onHand}</td>
                            <td>{target}</td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </Panel>
          ) : (
            <Panel title="Property history">
              <ol className="space-y-4 p-5">
                {operations?.history.map(([date, event, person]) => (
                  <li
                    key={`${date}${event}`}
                    className="border-l-2 border-primary-200 pl-4"
                  >
                    <p className="font-medium">{event}</p>
                    <p className="text-sm text-gray-500">
                      {date} · {person}
                    </p>
                  </li>
                ))}
              </ol>
            </Panel>
          )}
        </div>
      </DemoShell>
    );
  }
  if (kind === "request") {
    const request = item as NonNullable<
      ReturnType<typeof getShowcaseOwnerRequest>
    >;
    const workflow = getShowcaseRequestWorkflow(id);
    return (
      <DemoShell presentation={presentation} currentPath={currentPath}>
        <div>
          <PageHeader
            title={request.service}
            description={`${request.client} · ${request.property}`}
            back={{
              href: ownerPath("/requests", presentation),
              label: "Back to leads",
            }}
            action={<StatusBadge status={request.status} />}
          />
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Request context">
              <dl className="space-y-3 p-5 text-sm">
                <div>
                  <dt className="text-gray-500">Requested date</dt>
                  <dd className="font-medium">{request.requestedDate}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Source</dt>
                  <dd>{request.source}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Connections</dt>
                  <dd className="space-x-3">
                    <DetailLink
                      href={`/clients/${request.clientId}`}
                      presentation={presentation}
                    >
                      Client
                    </DetailLink>
                    <DetailLink
                      href={`/properties/${request.propertyId}`}
                      presentation={presentation}
                    >
                      Property
                    </DetailLink>
                  </dd>
                </div>
              </dl>
            </Panel>
            <div className="lg:col-span-2">
              <Panel title="Lifecycle">
                <div className="grid gap-2 p-5 sm:grid-cols-4">
                  {[
                    "Request reviewed",
                    "Walkthrough",
                    "Proposal",
                    "Agreement",
                  ].map((step, index) => (
                    <div
                      key={step}
                      className={`rounded-lg p-3 text-sm ${index === 0 || Boolean(workflow) ? "bg-green-50 text-green-800" : "bg-gray-50 text-gray-500"}`}
                    >
                      <CheckCircle2 className="mb-2 h-4 w-4" />
                      {step}
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
            <Panel title="Walkthrough">
              <div className="p-5 text-sm">
                {workflow?.walkthrough ? (
                  <>
                    <StatusBadge status={workflow.walkthrough.status} />
                    <p className="mt-3 font-medium">
                      {workflow.walkthrough.schedule}
                    </p>
                    <p className="mt-2 text-gray-600">
                      {workflow.walkthrough.notes}
                    </p>
                  </>
                ) : (
                  <p className="text-gray-500">No walkthrough required.</p>
                )}
              </div>
            </Panel>
            <Panel title="Proposal">
              <div className="p-5 text-sm">
                {workflow?.proposal ? (
                  <>
                    <StatusBadge status={workflow.proposal.status} />
                    <p className="mt-3 font-medium">
                      {workflow.proposal.title} ·{" "}
                      {money(workflow.proposal.priceCents)}
                    </p>
                    <p className="mt-2 text-gray-600">
                      {workflow.proposal.scope}
                    </p>
                  </>
                ) : (
                  <p className="text-gray-500">
                    Proposal will follow the walkthrough.
                  </p>
                )}
              </div>
            </Panel>
            <Panel title="Service agreement">
              <div className="p-5 text-sm">
                {workflow?.agreement ? (
                  <>
                    <StatusBadge status={workflow.agreement.status} />
                    <p className="mt-3 font-medium">
                      {workflow.agreement.title}
                    </p>
                    <p className="text-gray-500">
                      Signed {workflow.agreement.date}
                    </p>
                  </>
                ) : (
                  <p className="text-gray-500">Agreement not yet created.</p>
                )}
                {request.scheduledJobId && (
                  <div className="mt-4">
                    <DetailLink
                      href={`/jobs/${showcaseJobRouteId(request.scheduledJobId)}`}
                      presentation={presentation}
                    >
                      Open scheduled job →
                    </DetailLink>
                  </div>
                )}
              </div>
            </Panel>
            <div className="lg:col-span-3">
              <Panel title="Request history">
                <ol className="grid gap-3 p-5 sm:grid-cols-2">
                  {workflow?.timeline.map(([date, event]) => (
                    <li
                      key={`${date}${event}`}
                      className="border-l-2 border-primary-200 pl-3"
                    >
                      <p className="font-medium">{event}</p>
                      <p className="text-sm text-gray-500">{date}</p>
                    </li>
                  ))}
                </ol>
              </Panel>
            </div>
          </div>
        </div>
      </DemoShell>
    );
  }
  if (kind === "client") {
    const client = item as NonNullable<ReturnType<typeof getShowcaseClient>>;
    const property = getShowcaseProperty(client.propertyId);
    const request = getShowcaseOwnerRequest(client.requestId);
    return (
      <DemoShell presentation={presentation} currentPath={currentPath}>
        <div>
          <PageHeader
            title={client.name}
            description={`${client.business} · ${client.services}`}
            back={{
              href: ownerPath("/clients", presentation),
              label: "Back to clients",
            }}
            action={<StatusBadge status={client.status} />}
          />
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Relationship">
              <dl className="space-y-3 p-5 text-sm">
                <div>
                  <dt className="text-gray-500">Email</dt>
                  <dd className="break-all">{client.email}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Phone</dt>
                  <dd>{client.phone}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Connected locations</dt>
                  <dd>{client.locations}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Last updated</dt>
                  <dd>{client.updated}</dd>
                </div>
              </dl>
            </Panel>
            <div className="space-y-4 lg:col-span-2">
              <Panel title="Service journey">
                <div className="grid gap-3 p-5 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-gray-500">Property</p>
                    <DetailLink
                      href={`/properties/${client.propertyId}`}
                      presentation={presentation}
                    >
                      Open primary location →
                    </DetailLink>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Request</p>
                    <DetailLink
                      href={`/requests/${client.requestId}`}
                      presentation={presentation}
                    >
                      Open request →
                    </DetailLink>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Scheduled work</p>
                    {request?.scheduledJobId ? (
                      <DetailLink
                        href={`/jobs/${showcaseJobRouteId(request.scheduledJobId)}`}
                        presentation={presentation}
                      >
                        Open job detail
                      </DetailLink>
                    ) : (
                      <span className="text-sm text-gray-500">
                        Not scheduled
                      </span>
                    )}
                  </div>
                </div>
              </Panel>
              <Panel title="Relationship timeline">
                <ol className="space-y-3 p-5 text-sm">
                  <li>
                    <strong>Aug 2</strong> · Client profile reviewed
                  </li>
                  <li>
                    <strong>Aug 1</strong> · Service date confirmed
                  </li>
                  <li>
                    <strong>Jul 30</strong> · Proposal accepted
                  </li>
                  <li>
                    <strong>Jul 28</strong> · Request submitted through Client
                    Portal
                  </li>
                </ol>
              </Panel>
            </div>
            <div className="lg:col-span-3">
              <Panel title="Documents & billing">
                <div className="grid gap-3 p-5 sm:grid-cols-3">
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="font-medium">Service agreement</p>
                    <p className="text-sm text-green-700">Signed</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="font-medium">Latest invoice</p>
                    <p className="text-sm text-gray-500">
                      Connected to BrightSide billing
                    </p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="font-medium">Portal access</p>
                    <p className="text-sm text-green-700">Active</p>
                  </div>
                </div>
              </Panel>
            </div>
          </div>
        </div>
      </DemoShell>
    );
  }
  let content: ReactNode;
  if ((kind as string) === "property") {
    const property = item as ReturnType<typeof getShowcaseProperty> & {};
    const job = brightSideWorkerJobs.find((x) => x.id === property.jobId);
    content = (
      <Frame
        title={property.name}
        description={`${property.client} · ${property.type}`}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Location context">
            <dl className="space-y-4 p-5">
              <div>
                <dt className="text-sm text-gray-500">Address</dt>
                <dd className="font-medium">{property.address}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Service cadence</dt>
                <dd className="font-medium">{property.cadence}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Property notes</dt>
                <dd>{property.notes}</dd>
              </div>
            </dl>
          </Panel>
          <Panel title="Connected job">
            <div className="p-5">
              <h2 className="font-semibold">{job?.serviceTypeLabel}</h2>
              <p className="mt-1 text-sm text-gray-600">
                {job?.dateLabel} · {job?.startTime} ·{" "}
                {job && "teamName" in job ? job.teamName : "Assignment pending"}
              </p>
              <div className="mt-4">
                <DetailLink href="/jobs" presentation={presentation}>
                  Open job schedule →
                </DetailLink>
              </div>
            </div>
          </Panel>
        </div>
      </Frame>
    );
  } else if (kind === "employee") {
    const worker = item as ReturnType<typeof getShowcaseWorker> & {};
    const job = brightSideWorkerJobs.find((x) => x.id === worker.nextJobId);
    content = (
      <Frame
        title={worker.name}
        description={`${worker.role} · ${worker.team}`}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border bg-white p-5">
            <Users className="h-5 w-5 text-primary-600" />
            <p className="mt-3 text-2xl font-bold">{worker.jobsThisWeek}</p>
            <p className="text-sm text-gray-500">Jobs this week</p>
          </div>
          <div className="rounded-2xl border bg-white p-5 sm:col-span-2">
            <h2 className="font-semibold">Next assignment</h2>
            <p className="mt-3 text-lg font-medium">{job?.propertyName}</p>
            <p className="text-sm text-gray-500">
              {job?.dateLabel} · {job?.startTime}
            </p>
            <div className="mt-4">
              <DetailLink href="/jobs" presentation={presentation}>
                View job context →
              </DetailLink>
            </div>
          </div>
        </div>
      </Frame>
    );
  } else if ((kind as string) === "request") {
    const request = item as ReturnType<typeof getShowcaseOwnerRequest> & {};
    content = (
      <Frame
        title={request.service}
        description={`${request.client} · ${request.property}`}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Request context">
            <dl className="space-y-4 p-5">
              <div>
                <dt className="text-sm text-gray-500">Status</dt>
                <dd className="mt-1">
                  <Status
                    tone={request.status === "submitted" ? "amber" : "blue"}
                  >
                    {request.status}
                  </Status>
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Requested date</dt>
                <dd className="font-medium">{request.requestedDate}</dd>
              </div>
            </dl>
          </Panel>
          <Panel title="Workflow">
            <div className="p-5">
              <Sparkles className="h-5 w-5 text-primary-600" />
              <p className="mt-3 text-sm text-gray-600">
                Request reviewed → proposal accepted → schedule confirmed → job
                delivered.
              </p>
              {request.scheduledJobId && (
                <div className="mt-4">
                  <DetailLink href="/jobs" presentation={presentation}>
                    View scheduled work →
                  </DetailLink>
                </div>
              )}
            </div>
          </Panel>
        </div>
      </Frame>
    );
  } else if ((kind as string) === "client") {
    const client = item as ReturnType<typeof getShowcaseClient> & {};
    content = (
      <Frame
        title={client.name}
        description={`${client.business} · ${client.services}`}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Relationship">
            <div className="p-5">
              <Status>{client.status}</Status>
              <p className="mt-4 text-sm text-gray-600">
                {client.locations} connected locations with BrightSide service
                history.
              </p>
              <div className="mt-4">
                <DetailLink
                  href={`/properties/${client.propertyId}`}
                  presentation={presentation}
                >
                  Open primary location →
                </DetailLink>
              </div>
            </div>
          </Panel>
          <Panel title="Current journey">
            <div className="p-5">
              <p className="text-sm text-gray-600">
                A client request connects this relationship to a scheduled
                service.
              </p>
              <div className="mt-4">
                <DetailLink
                  href={`/requests/${client.requestId}`}
                  presentation={presentation}
                >
                  Open request →
                </DetailLink>
              </div>
            </div>
          </Panel>
        </div>
      </Frame>
    );
  } else {
    const account = item as ReturnType<
      typeof getShowcaseCommercialAccount
    > & {};
    content = (
      <Frame
        title={account.name}
        description={`${account.location} · ${account.cadence}`}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Recurring service">
            <dl className="space-y-4 p-5">
              <div>
                <dt className="text-sm text-gray-500">Next service</dt>
                <dd className="font-medium">{account.nextService}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Monthly value</dt>
                <dd className="font-medium">
                  {money(account.monthlyValueCents)}
                </dd>
              </div>
            </dl>
          </Panel>
          <Panel title="Billing context">
            <div className="p-5">
              <Building2 className="h-5 w-5 text-primary-600" />
              <p className="mt-3 text-sm text-gray-600">
                The account’s representative invoice is included in the
                financial Showcase.
              </p>
              <div className="mt-4">
                <DetailLink
                  href="/commercial-invoices"
                  presentation={presentation}
                >
                  Open invoices →
                </DetailLink>
              </div>
            </div>
          </Panel>
        </div>
      </Frame>
    );
  }
  return (
    <DemoShell presentation={presentation} currentPath={currentPath}>
      {content}
    </DemoShell>
  );
}
