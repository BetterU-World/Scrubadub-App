import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { getStaffSessionToken, useAuth } from "@/hooks/useAuth";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { OwnerGettingStarted } from "@/components/owner/OwnerOnboarding";
import { OwnerDashboardPresentation } from "@/features/owner-dashboard/OwnerDashboardPresentation";
import { adaptProductionOwnerDashboard } from "@/features/owner-dashboard/ownerDashboardAdapter";

export function DashboardPage() {
  const { user } = useAuth();
  const stats = useQuery(
    api.queries.dashboard.getStats,
    user?.companyId ? { companyId: user.companyId, userId: user._id, sessionToken: getStaffSessionToken() } : "skip"
  );

  if (!user) return <PageLoader />;

  const model = adaptProductionOwnerDashboard({
    firstName: user.name.split(" ")[0],
    companyName: user.companyName,
    stats,
  });

  return (
    <OwnerDashboardPresentation
      model={model}
      interactionMode="production"
      gettingStarted={<OwnerGettingStarted surface="dashboard" />}
    />
  );
}
