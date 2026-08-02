import { DemoShell } from "../../demo/DemoShell";
import { ownerDashboardFixtures } from "../../demo/fixtures/ownerDashboardFixtures";
import { OwnerDashboardPresentation } from "../../features/owner-dashboard/OwnerDashboardPresentation";

export function DemoOwnerPage({ presentation = false }: { presentation?: boolean }) {
  return (
    <DemoShell presentation={presentation}>
      <OwnerDashboardPresentation
        model={ownerDashboardFixtures.canonical}
        interactionMode="static"
      />
    </DemoShell>
  );
}
