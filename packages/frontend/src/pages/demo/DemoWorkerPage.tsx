import { DemoShell } from "../../demo/DemoShell";
import { ShowcaseWorkerJobPreview } from "../../demo/ShowcaseWorkerJobPreview";
import { brightSideWorkerHomeFixture, brightSideWorkerJobPreviewFixture } from "../../demo/fixtures/workerShowcaseFixtures";
import { WorkerHomePresentation } from "../../features/worker-home/WorkerHomePresentation";

export function DemoWorkerPage({
  presentation = false,
  currentPath = "/internal/demo/worker",
}: {
  presentation?: boolean;
  currentPath?: string;
}) {
  return <DemoShell presentation={presentation} persona="worker" currentPath={currentPath}>
    <WorkerHomePresentation
      model={brightSideWorkerHomeFixture}
      interactionMode="static"
      afterWelcome={<ShowcaseWorkerJobPreview model={brightSideWorkerJobPreviewFixture} />}
    />
  </DemoShell>;
}
