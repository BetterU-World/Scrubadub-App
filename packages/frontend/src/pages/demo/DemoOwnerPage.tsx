import { DemoShell } from "../../demo/DemoShell";
import { ownerDashboardFixtures } from "../../demo/fixtures/ownerDashboardFixtures";
import { OwnerDashboardPresentation } from "../../features/owner-dashboard/OwnerDashboardPresentation";
import { CalendarDays, CheckCircle2, Clock3, MapPin, Users } from "lucide-react";

export function DemoOwnerPage({
  presentation = false,
  currentPath = "/internal/demo/owner",
}: {
  presentation?: boolean;
  currentPath?: string;
}) {
  if (currentPath.endsWith("/jobs")) {
    return <DemoOwnerJobsPage presentation={presentation} currentPath={currentPath} />;
  }

  const model = presentation
    ? { ...ownerDashboardFixtures.canonical, onboarding: null }
    : ownerDashboardFixtures.canonical;

  return (
    <DemoShell presentation={presentation} currentPath={currentPath}>
      <OwnerDashboardPresentation
        model={model}
        interactionMode="static"
      />
    </DemoShell>
  );
}

function DemoOwnerJobsPage({ presentation, currentPath }: { presentation: boolean; currentPath: string }) {
  const jobs = ownerDashboardFixtures.canonical.upcomingJobs;
  return <DemoShell presentation={presentation} currentPath={currentPath}>
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary-700">BrightSide Cleaning Co.</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">Jobs</h1><p className="mt-2 text-gray-600">Today’s active schedule and the work coming next.</p></div>
        <div className="inline-flex items-center gap-2 self-start rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm font-medium text-primary-800"><CalendarDays className="h-5 w-5" aria-hidden="true" />August 2–3, 2026</div>
      </header>
      <div className="grid gap-4 sm:grid-cols-3">
        {[['Today', '2', Clock3], ['In progress', '1', Users], ['Ready next', '3', CheckCircle2]].map(([label, value, Icon]) => { const TileIcon = Icon as typeof Clock3; return <div key={String(label)} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><TileIcon className="h-5 w-5 text-primary-600" aria-hidden="true" /><p className="mt-4 text-3xl font-bold text-gray-900">{String(value)}</p><p className="text-sm text-gray-500">{String(label)}</p></div>; })}
      </div>
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm" aria-labelledby="owner-jobs-schedule">
        <div className="border-b border-gray-200 px-5 py-4"><h2 id="owner-jobs-schedule" className="text-lg font-semibold text-gray-900">Operating schedule</h2></div>
        <div className="divide-y divide-gray-100">{jobs.map((job) => <article key={job.id} className="grid gap-4 px-5 py-5 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-center"><div><p className="text-sm font-semibold text-gray-900">{job.scheduleLabel.split(' · ')[0]}</p><p className="mt-1 text-sm text-gray-500">{job.scheduleLabel.split(' · ')[1]}</p></div><div className="min-w-0"><h3 className="font-semibold text-gray-900">{job.propertyName}</h3><p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500"><MapPin className="h-4 w-4" aria-hidden="true" />BrightSide service location</p></div><span className={`badge justify-self-start capitalize ${job.status === 'in_progress' ? 'bg-purple-100 text-purple-800' : job.status === 'confirmed' ? 'bg-blue-100 text-blue-800' : 'bg-primary-100 text-primary-800'}`}>{job.status.replace(/_/g, ' ')}</span></article>)}</div>
      </section>
    </div>
  </DemoShell>;
}
