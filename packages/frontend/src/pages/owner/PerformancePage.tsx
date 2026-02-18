import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { BarChart3 } from "lucide-react";

export function PerformancePage() {
  return (
    <div>
      <PageHeader
        title="Team Performance"
        description="Cleaner leaderboard and performance metrics"
      />
      <EmptyState
        icon={BarChart3}
        title="Coming soon"
        description="Performance metrics will be available in a future update"
      />
    </div>
  );
}
