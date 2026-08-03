import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { DemoShell } from "../../demo/DemoShell";
import { ShowcaseWorkerJobPreview } from "../../demo/ShowcaseWorkerJobPreview";
import {
  ShowcaseChecklistHeading,
  ShowcaseUnknownJob,
  ShowcaseWorkerJobDetailPresentation,
  ShowcaseWorkerJobsPresentation,
} from "../../demo/ShowcaseWorkerJourney";
import {
  brightSideWorkerJobPreviewFixture,
  brightSideWorkerJobs,
  getBrightSideWorkerJob,
} from "../../demo/fixtures/workerShowcaseFixtures";
import { buildShowcasePath } from "../../demo/showcaseRegistry";

interface WorkerJourneyPageProps {
  presentation: boolean;
  currentPath: string;
}

export function DemoWorkerJobsPage({ presentation, currentPath }: WorkerJourneyPageProps) {
  return <DemoShell presentation={presentation} persona="worker" currentPath={currentPath}><ShowcaseWorkerJobsPresentation jobs={brightSideWorkerJobs} presentation={presentation} /></DemoShell>;
}

export function DemoWorkerJobDetailPage({
  showcaseJobId,
  presentation,
  currentPath,
}: WorkerJourneyPageProps & { showcaseJobId: string }) {
  const job = getBrightSideWorkerJob(showcaseJobId);
  return <DemoShell presentation={presentation} persona="worker" currentPath={currentPath}>{job ? <ShowcaseWorkerJobDetailPresentation job={job} presentation={presentation} /> : <ShowcaseUnknownJob presentation={presentation} />}</DemoShell>;
}

export function DemoWorkerChecklistPage({
  showcaseJobId,
  presentation,
  currentPath,
}: WorkerJourneyPageProps & { showcaseJobId: string }) {
  const job = getBrightSideWorkerJob(showcaseJobId);
  return (
    <DemoShell presentation={presentation} persona="worker" currentPath={currentPath}>
      {job ? <div className="mx-auto max-w-4xl space-y-4">
        <Link href={buildShowcasePath("worker", `/jobs/${job.id}`, presentation)} className="inline-flex items-center gap-2 rounded-lg text-sm font-semibold text-primary-700 outline-none ring-primary-500 focus-visible:ring-2 focus-visible:ring-offset-4"><ArrowLeft aria-hidden="true" className="h-4 w-4" />Back to job details</Link>
        <ShowcaseChecklistHeading job={job} />
        <ShowcaseWorkerJobPreview model={brightSideWorkerJobPreviewFixture} />
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800"><p className="font-semibold">Read-only Showcase workspace</p><p className="mt-1">Checklist selections, photos, and submission controls are intentionally presentation-only.</p></div>
      </div> : <ShowcaseUnknownJob presentation={presentation} />}
    </DemoShell>
  );
}
