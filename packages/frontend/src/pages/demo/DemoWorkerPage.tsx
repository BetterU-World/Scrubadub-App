import { DemoShell } from "../../demo/DemoShell";
import { ShowcaseWorkerJobPreview } from "../../demo/ShowcaseWorkerJobPreview";
import { brightSideWorkerHomeFixture, brightSideWorkerJobPreviewFixture } from "../../demo/fixtures/workerShowcaseFixtures";
import { WorkerHomePresentation } from "../../features/worker-home/WorkerHomePresentation";

export function DemoWorkerPage({ presentation = false }: { presentation?: boolean }) {
  return <DemoShell presentation={presentation} persona="worker">
    <WorkerHomePresentation
      model={brightSideWorkerHomeFixture}
      interactionMode="static"
      afterWelcome={<ShowcaseWorkerJobPreview model={brightSideWorkerJobPreviewFixture} />}
    />
  </DemoShell>;
}
