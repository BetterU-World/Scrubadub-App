import { DemoShell } from "../../demo/DemoShell";
import { ShowcaseWorkerHomePresentation } from "../../demo/ShowcaseWorkerJourney";
import { brightSideWorkerHomeFixture, getBrightSideWorkerJob, RIVERSTONE_SHOWCASE_JOB_ID } from "../../demo/fixtures/workerShowcaseFixtures";

export function DemoWorkerPage({
  presentation = false,
  currentPath = "/internal/demo/worker",
}: {
  presentation?: boolean;
  currentPath?: string;
}) {
  return <DemoShell presentation={presentation} persona="worker" currentPath={currentPath}>
    <ShowcaseWorkerHomePresentation
      model={brightSideWorkerHomeFixture}
      primaryJob={getBrightSideWorkerJob(RIVERSTONE_SHOWCASE_JOB_ID)!}
      presentation={presentation}
    />
  </DemoShell>;
}
