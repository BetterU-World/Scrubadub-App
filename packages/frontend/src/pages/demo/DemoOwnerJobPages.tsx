import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  CalendarDays,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Filter,
  MapPin,
  Search,
  Users,
} from "lucide-react";
import { DemoShell } from "../../demo/DemoShell";
import { buildShowcasePath } from "../../demo/showcaseRegistry";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";
import {
  brightSideWorkerJobs,
  getBrightSideWorkerJob,
} from "../../demo/fixtures/workerShowcaseFixtures";
import {
  getShowcaseProperty,
  getShowcasePropertyOperations,
  showcaseSchedule,
} from "../../demo/fixtures/operationsShowcaseFixtures";

const path = (value: string, presentation: boolean) =>
  buildShowcasePath("owner", value, presentation);
const propertyIdForJob = (id: string) =>
  id.startsWith("riverstone")
    ? "riverstone"
    : id.startsWith("linden")
      ? "linden"
      : id.startsWith("harbor")
        ? "harborview"
        : "sunroom";

export function DemoOwnerJobsPage({
  presentation,
  currentPath,
}: {
  presentation: boolean;
  currentPath: string;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [assignment, setAssignment] = useState("all");
  const [sort, setSort] = useState("soonest");
  const jobs = useMemo(
    () =>
      showcaseSchedule
        .filter(
          (job) =>
            (status === "all" || job.status === status) &&
            (assignment === "all" ||
              job.worker.toLowerCase().includes(assignment)) &&
            `${job.propertyName} ${job.client} ${job.worker}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .slice()
        .sort((a, b) =>
          sort === "soonest"
            ? `${a.scheduledDate}${a.startTime}`.localeCompare(
                `${b.scheduledDate}${b.startTime}`,
              )
            : sort === "newest"
              ? b.id.localeCompare(a.id)
              : a.propertyName.localeCompare(b.propertyName),
        ),
    [query, status, assignment, sort],
  );
  return (
    <DemoShell presentation={presentation} currentPath={currentPath}>
      <div>
        <PageHeader
          title="Jobs"
          description="Search, filter, assign, and follow work from scheduling through quality approval."
        />
        <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem_11rem_12rem]">
          <label className="relative">
            <Search className="absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search jobs"
              className="input-field pl-9"
            />
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="input-field"
          >
            <option value="all">All statuses</option>
            <option value="in_progress">In progress</option>
            <option value="confirmed">Confirmed</option>
            <option value="scheduled">Scheduled</option>
            <option value="approved">Approved</option>
          </select>
          <select
            value={assignment}
            onChange={(e) => setAssignment(e.target.value)}
            className="input-field"
          >
            <option value="all">All assignments</option>
            <option value="elena">Elena Ruiz</option>
            <option value="maya">Maya Brooks</option>
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="input-field"
          >
            <option value="soonest">Soonest scheduled</option>
            <option value="newest">Newest</option>
            <option value="property">Property name</option>
          </select>
        </div>
        <div className="mb-4 flex gap-2 overflow-x-auto">
          <button className="touch-target rounded-lg bg-primary-600 px-4 text-sm text-white">
            All Jobs
          </button>
          <button
            disabled
            className="touch-target rounded-lg border bg-white px-4 text-sm text-gray-600"
          >
            My Jobs
          </button>
          <span className="ml-auto hidden items-center gap-1 text-sm text-gray-500 sm:flex">
            <Filter className="h-4 w-4" />
            {jobs.length} results
          </span>
        </div>
        <div className="grid gap-3">
          {jobs.map((job) => (
            <Link
              key={job.id}
              href={path(`/jobs/${job.id}`, presentation)}
              className="card block"
            >
              <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)_10rem_auto] sm:items-center">
                <div>
                  <p className="font-semibold">{job.dateLabel}</p>
                  <p className="text-sm text-gray-500">{job.startTime}</p>
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold">{job.propertyName}</h2>
                  <p className="text-sm text-gray-500">
                    {job.serviceTypeLabel} · {job.client}
                  </p>
                </div>
                <div className="text-sm">
                  <p className="font-medium">{job.worker}</p>
                  <p className="text-gray-500">
                    {"teamName" in job ? job.teamName : "Individual"}
                  </p>
                </div>
                <StatusBadge status={job.status} />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </DemoShell>
  );
}

export function DemoOwnerJobDetailPage({
  jobId,
  presentation,
  currentPath,
}: {
  jobId: string;
  presentation: boolean;
  currentPath: string;
}) {
  const job = getBrightSideWorkerJob(jobId);
  if (!job)
    return (
      <DemoShell presentation={presentation} currentPath={currentPath}>
        <PageHeader
          title="Job not found"
          back={{ href: path("/jobs", presentation), label: "Back to jobs" }}
        />
      </DemoShell>
    );
  const propertyId = propertyIdForJob(job.id);
  const property = getShowcaseProperty(propertyId);
  const operations = getShowcasePropertyOperations(propertyId);
  const worker =
    showcaseSchedule.find((x) => x.id === job.id)?.worker ?? "Unassigned";
  return (
    <DemoShell presentation={presentation} currentPath={currentPath}>
      <div className="space-y-5">
        <PageHeader
          title={`${property?.name ?? job.propertyName} · ${job.serviceTypeLabel}`}
          description="Owners and managers can review assignments, instructions, execution evidence, inventory, and approval from one job record."
          back={{ href: path("/jobs", presentation), label: "Back to jobs" }}
          action={<StatusBadge status={job.status} />}
        />
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="card lg:col-span-2">
            <h2 className="font-semibold">Schedule & assignment</h2>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <p className="flex gap-2">
                <CalendarDays className="h-4 w-4 text-gray-400" />
                {job.scheduledDate} · {job.startTime}
              </p>
              <p className="flex gap-2">
                <Users className="h-4 w-4 text-gray-400" />
                {worker} · {"teamName" in job ? job.teamName : "Individual assignment"}
              </p>
              <Link
                href={path(`/properties/${propertyId}`, presentation)}
                className="flex gap-2 font-medium text-primary-700"
              >
                <MapPin className="h-4 w-4" />
                {job.address}
              </Link>
              <p className="flex gap-2">
                <Clock3 className="h-4 w-4 text-gray-400" />
                {job.durationMinutes} planned minutes
              </p>
            </div>
          </section>
          <section className="card">
            <h2 className="font-semibold">Execution</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Timer</dt>
                <dd className="font-medium">2h 08m elapsed</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Checklist</dt>
                <dd className="font-medium">9 of 12</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Submission</dt>
                <dd className="font-medium">
                  {job.status === "approved" ? "Approved" : "In progress"}
                </dd>
              </div>
            </dl>
          </section>
        </div>
        <section className="card">
          <h2 className="font-semibold">Property instructions</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <h3 className="text-xs font-semibold uppercase text-gray-500">
                Access
              </h3>
              <p className="mt-1 text-sm">
                {operations?.access ??
                  job.accessInstructions ??
                  "Access details available to assigned workers."}
              </p>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase text-gray-500">
                Service notes
              </h3>
              <p className="mt-1 text-sm">
                {operations?.cleaning ??
                  job.notes ??
                  "Complete the assigned service checklist."}
              </p>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase text-gray-500">
                Add-ons
              </h3>
              <p className="mt-1 text-sm">
                {job.requiredAddOns?.join(", ") ?? "None required"}
              </p>
            </div>
          </div>
        </section>
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card">
            <h2 className="flex items-center gap-2 font-semibold">
              <ClipboardCheck className="h-5 w-5 text-primary-600" />
              Checklist & inventory
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              Workers verify service tasks and report supplies that fall below
              the property target.
            </p>
            <div className="mt-4 space-y-2">
              {[
                "Kitchen surfaces and appliances",
                "Primary suite reset",
                "Bathrooms sanitized",
                "Final walkthrough",
              ].map((item, index) => (
                <div
                  key={item}
                  className="flex items-center gap-2 rounded-lg bg-gray-50 p-3 text-sm"
                >
                  {index < 3 ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <span className="h-4 w-4 rounded-full border" />
                  )}
                  {item}
                </div>
              ))}
            </div>
            {operations?.inventory?.slice(0, 2).map((item) => (
              <p key={item[1]} className="mt-2 text-xs text-gray-500">
                {item[1]}: {item[2]} on hand / target {item[3]}
              </p>
            ))}
          </section>
          <section className="card">
            <h2 className="flex items-center gap-2 font-semibold">
              <Camera className="h-5 w-5 text-primary-600" />
              Verification & quality
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              Before/after photos and issues stay attached to the job for owner
              review.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {["Before", "After", "Issue"].map((label, index) => (
                <div
                  key={label}
                  className={`flex aspect-square items-end rounded-lg p-2 text-xs font-medium ${index === 2 ? "bg-amber-100 text-amber-800" : "bg-primary-100 text-primary-800"}`}
                >
                  {label} photo
                </div>
              ))}
            </div>
            {operations?.issue && (
              <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                Red flag: {operations.issue}
              </p>
            )}
          </section>
        </div>
        <section className="card">
          <h2 className="font-semibold">Job history</h2>
          <ol className="mt-4 space-y-3 border-l-2 border-primary-100 pl-4 text-sm">
            {[
              ["Aug 1", "Job scheduled"],
              ["Aug 2 · 8:54 AM", `${worker} arrived`],
              ["Aug 2 · 9:00 AM", "Timer started"],
              ["Aug 2 · 10:32 AM", "Verification photos uploaded"],
            ].map(([date, event]) => (
              <li key={event}>
                <p className="font-medium">{event}</p>
                <p className="text-xs text-gray-500">{date}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </DemoShell>
  );
}
