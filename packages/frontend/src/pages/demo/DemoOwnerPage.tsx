import { DemoShell } from "../../demo/DemoShell";
import { ownerDashboardFixtures } from "../../demo/fixtures/ownerDashboardFixtures";
import { OwnerDashboardPresentation } from "../../features/owner-dashboard/OwnerDashboardPresentation";

export function DemoOwnerPage({
  presentation = false,
  currentPath = "/internal/demo/owner",
}: {
  presentation?: boolean;
  currentPath?: string;
}) {
  return (
    <DemoShell presentation={presentation} currentPath={currentPath}>
      <OwnerDashboardPresentation
        model={ownerDashboardFixtures.canonical}
        interactionMode="static"
      />
    </DemoShell>
  );
}
