import {
  ArrowLeft,
  Bell,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock,
  KeyRound,
  MapPin,
  PackageCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Link } from "wouter";
import { StatusBadge } from "../components/ui/StatusBadge";
import type { WorkerHomeViewModel } from "../features/worker-home/workerHomeViewModel";
import type { ShowcaseWorkerJob } from "./fixtures/workerShowcaseFixtures";
import { buildShowcasePath } from "./showcaseRegistry";

function workerPath(relativePath: string, presentation: boolean) {
  return buildShowcasePath("worker", relativePath, presentation);
}

function jobPath(jobId: string, presentation: boolean) {
  return workerPath(`/jobs/${jobId}`, presentation);
}

export function ShowcaseWorkerHomePresentation({
  model,
  primaryJob,
  presentation,
}: {
  model: WorkerHomeViewModel;
  primaryJob: ShowcaseWorkerJob;
  presentation: boolean;
}) {
  return (
    <div className="space-y-4">
      <section className="card overflow-hidden bg-gradient-to-br from-white via-white to-primary-50">
        <p className="text-sm font-medium text-gray-500">Worker Home</p>
        <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-950">Good morning, {model.worker.name}</h1>
            <p className="mt-1 text-sm text-gray-600">Your first assignment is in progress. Finish Riverstone before the next visit.</p>
          </div>
          <div className="rounded-lg bg-amber-50 px-4 py-3 text-amber-900">
            <p className="text-sm font-semibold">{model.notifications.unreadCount} urgent updates</p>
            <p className="mt-0.5 text-xs text-amber-700">One schedule note and one company update</p>
          </div>
        </div>
      </section>

      <Link
        href={jobPath(primaryJob.id, presentation)}
        className="group block overflow-hidden rounded-xl border border-primary-100 bg-white shadow-sm outline-none ring-primary-500 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        <div className="bg-primary-600 px-4 py-4 text-white sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-100">Do this now</p>
              <h2 className="mt-1 text-xl font-bold">{primaryJob.propertyName}</h2>
              <p className="mt-1 text-sm text-primary-100">{primaryJob.serviceTypeLabel}</p>
            </div>
            <StatusBadge status={primaryJob.status} />
          </div>
        </div>
        <div className="grid gap-3 p-4 text-sm text-gray-600 sm:grid-cols-3 sm:p-5">
          <p className="flex items-center gap-2"><Clock aria-hidden="true" className="h-4 w-4 text-gray-400" />{primaryJob.dateLabel} · {primaryJob.startTime}</p>
          <p className="flex min-w-0 items-start gap-2"><MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none text-gray-400" /><span>{primaryJob.address}</span></p>
          <p className="flex items-center justify-between gap-2 font-semibold text-primary-700 sm:justify-end">Open assignment <ChevronRight aria-hidden="true" className="h-4 w-4 transition group-hover:translate-x-0.5" /></p>
        </div>
      </Link>

      <div className="grid gap-4 md:grid-cols-3">
        <section className="card">
          <div className="flex items-center gap-2 text-gray-900"><Calendar aria-hidden="true" className="h-5 w-5 text-primary-600" /><h2 className="font-semibold">Today’s schedule</h2></div>
          <p className="mt-3 text-3xl font-bold text-gray-950">{model.todayJobs.length}</p>
          <p className="mt-1 text-sm text-gray-500">assignments · next at 11:30 AM</p>
        </section>
        <section className="card">
          <div className="flex items-center gap-2 text-gray-900"><Bell aria-hidden="true" className="h-5 w-5 text-amber-600" /><h2 className="font-semibold">Needs attention</h2></div>
          <p className="mt-3 text-sm leading-6 text-gray-600">Complete Riverstone’s final walkthrough and review the updated safety policy.</p>
        </section>
        <Link href={workerPath("/jobs", presentation)} className="card group outline-none ring-primary-500 transition hover:border-primary-200 hover:shadow-md focus-visible:ring-2">
          <div className="flex items-center gap-2 text-gray-900"><ClipboardCheck aria-hidden="true" className="h-5 w-5 text-primary-600" /><h2 className="font-semibold">My jobs</h2></div>
          <p className="mt-3 text-sm leading-6 text-gray-600">See active, upcoming, and recently completed assignments.</p>
          <p className="mt-4 flex items-center gap-1 text-sm font-semibold text-primary-700">View all jobs <ChevronRight aria-hidden="true" className="h-4 w-4 transition group-hover:translate-x-0.5" /></p>
        </Link>
      </div>
    </div>
  );
}

export function ShowcaseWorkerJobsPresentation({
  jobs,
  presentation,
}: {
  jobs: readonly ShowcaseWorkerJob[];
  presentation: boolean;
}) {
  const groups = [
    { title: "Active job", jobs: jobs.filter((job) => job.status === "in_progress") },
    { title: "Upcoming jobs", jobs: jobs.filter((job) => job.status === "confirmed" || job.status === "scheduled") },
    { title: "Completed jobs", jobs: jobs.filter((job) => job.status === "approved") },
  ];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-primary-700">Worker experience</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-950">My Jobs</h1>
        <p className="mt-2 text-gray-600">Your assigned work for BrightSide Cleaning Co.</p>
      </header>
      {groups.map((group) => (
        <section key={group.title} aria-labelledby={`showcase-${group.title.replace(/ /g, "-")}`}>
          <h2 id={`showcase-${group.title.replace(/ /g, "-")}`} className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">{group.title}</h2>
          <div className="space-y-3">
            {group.jobs.map((job) => (
              <Link key={job.id} href={jobPath(job.id, presentation)} className="card group block outline-none ring-primary-500 transition hover:border-primary-200 hover:shadow-md focus-visible:ring-2">
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-950">{job.propertyName}</h3>
                    {job.teamName && <p className="mt-0.5 text-xs font-medium text-blue-700">Team: {job.teamName}</p>}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-500">
                      <span className="flex items-center gap-1.5"><Calendar aria-hidden="true" className="h-4 w-4" />{job.dateLabel}</span>
                      <span className="flex items-center gap-1.5"><Clock aria-hidden="true" className="h-4 w-4" />{job.startTime}</span>
                      <span className="flex min-w-0 items-start gap-1.5"><MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none" />{job.address}</span>
                    </div>
                  </div>
                  <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:flex-col sm:items-end">
                    <StatusBadge status={job.status} />
                    <span className="flex items-center gap-1 text-sm font-semibold text-primary-700">View job <ChevronRight aria-hidden="true" className="h-4 w-4 transition group-hover:translate-x-0.5" /></span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function ShowcaseWorkerJobDetailPresentation({
  job,
  presentation,
}: {
  job: ShowcaseWorkerJob;
  presentation: boolean;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={workerPath("/jobs", presentation)} className="inline-flex items-center gap-2 rounded-lg text-sm font-semibold text-primary-700 outline-none ring-primary-500 focus-visible:ring-2 focus-visible:ring-offset-4">
        <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Back to My Jobs
      </Link>
      <header className="card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-primary-700">{job.serviceTypeLabel}</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-950">{job.propertyName}</h1>
          </div>
          <StatusBadge status={job.status} />
        </div>
        <div className="mt-5 grid gap-3 text-sm text-gray-600 sm:grid-cols-2">
          <p className="flex items-center gap-2"><Calendar aria-hidden="true" className="h-4 w-4 text-gray-400" />{job.dateLabel} · {job.scheduledDate}</p>
          <p className="flex items-center gap-2"><Clock aria-hidden="true" className="h-4 w-4 text-gray-400" />{job.startTime} · {job.durationMinutes} minutes</p>
          <p className="flex items-start gap-2"><MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none text-gray-400" />{job.address}</p>
          {job.teamName && <p className="flex items-center gap-2"><Users aria-hidden="true" className="h-4 w-4 text-gray-400" />{job.teamName}</p>}
        </div>
      </header>

      {job.accessInstructions && <section className="rounded-xl border border-yellow-200 bg-yellow-50 p-4"><h2 className="flex items-center gap-2 font-semibold text-yellow-900"><KeyRound aria-hidden="true" className="h-4 w-4" />Access instructions</h2><p className="mt-2 text-sm leading-6 text-yellow-800">{job.accessInstructions}</p></section>}
      {job.notes && <section className="card"><h2 className="font-semibold text-gray-900">Job notes</h2><p className="mt-2 text-sm leading-6 text-gray-600">{job.notes}</p></section>}
      {job.requiredAddOns && <section className="card"><h2 className="flex items-center gap-2 font-semibold text-gray-900"><PackageCheck aria-hidden="true" className="h-5 w-5 text-primary-600" />Required add-ons</h2><ul className="mt-3 grid gap-2 sm:grid-cols-2">{job.requiredAddOns.map((addOn) => <li key={addOn} className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">{addOn}</li>)}</ul></section>}

      <Link href={workerPath(`/jobs/${job.id}/checklist`, presentation)} className="group flex items-center justify-between gap-4 rounded-xl bg-primary-600 p-5 text-white shadow-sm outline-none ring-primary-500 transition hover:bg-primary-700 focus-visible:ring-2 focus-visible:ring-offset-2">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-100">Work area</p><h2 className="mt-1 text-lg font-bold">Continue cleaning checklist</h2><p className="mt-1 text-sm text-primary-100">9 of 12 items complete · 3 photos attached</p></div>
        <ChevronRight aria-hidden="true" className="h-6 w-6 flex-none transition group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}

export function ShowcaseUnknownJob({ presentation }: { presentation: boolean }) {
  return <div className="mx-auto max-w-2xl rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center shadow-sm"><Sparkles aria-hidden="true" className="mx-auto h-9 w-9 text-primary-600" /><p className="mt-4 text-sm font-semibold text-primary-700">SCRUB Showcase</p><h1 className="mt-2 text-3xl font-bold text-gray-950">Job not found</h1><p className="mt-3 text-gray-600">This assignment is not part of the BrightSide Showcase schedule.</p><Link href={workerPath("/jobs", presentation)} className="mt-6 inline-flex items-center gap-2 rounded-lg font-semibold text-primary-700 outline-none ring-primary-500 focus-visible:ring-2 focus-visible:ring-offset-4"><ArrowLeft aria-hidden="true" className="h-4 w-4" />Return to My Jobs</Link></div>;
}

export function ShowcaseChecklistHeading({ job }: { job: ShowcaseWorkerJob }) {
  return <div><p className="flex items-center gap-2 text-sm font-medium text-primary-700"><CheckCircle2 aria-hidden="true" className="h-4 w-4" />Cleaning workspace</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-950">{job.propertyName} Checklist</h1><p className="mt-2 text-gray-600">Complete the cleaning form, attach completion photos, and prepare the job for review.</p></div>;
}
