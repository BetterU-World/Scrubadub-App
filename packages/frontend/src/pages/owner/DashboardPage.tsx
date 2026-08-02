import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { getStaffSessionToken, useAuth } from "@/hooks/useAuth";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { SuccessModal, shouldShowSuccessModal } from "@/components/owner/SuccessModal";
import { OwnerDashboardPresentation } from "@/features/owner-dashboard/OwnerDashboardPresentation";
import { adaptProductionOwnerDashboard } from "@/features/owner-dashboard/ownerDashboardAdapter";

const LS_MANUAL_READ = "scrubadub_onboarding_manual_read";

export function DashboardPage() {
  const { user, sessionToken } = useAuth();
  const stats = useQuery(
    api.queries.dashboard.getStats,
    user?.companyId ? { companyId: user.companyId, userId: user._id, sessionToken: getStaffSessionToken() } : "skip"
  );

  // Success modal for first-time owners
  const [showSuccess, setShowSuccess] = useState(shouldShowSuccessModal);
  const mySite = useQuery(
    api.queries.companySites.getMySite,
    user?.companyId && user?.role === "owner" && showSuccess && sessionToken
      ? { companyId: user.companyId, userId: user._id, sessionToken }
      : "skip"
  );
  const [manualRead, setManualRead] = useState(
    () => localStorage.getItem(LS_MANUAL_READ) === "1"
  );

  if (!user) return <PageLoader />;

  const model = adaptProductionOwnerDashboard({
    firstName: user.name.split(" ")[0],
    companyName: user.companyName,
    stats,
    manualRead,
  });

  const handleMarkManualsRead = () => {
    localStorage.setItem(LS_MANUAL_READ, "1");
    setManualRead(true);
  };

  return (
    <div>
      {showSuccess && mySite && (
        <SuccessModal
          slug={mySite.slug}
          publicRequestToken={mySite.publicRequestToken}
          onDismiss={() => setShowSuccess(false)}
        />
      )}

      <OwnerDashboardPresentation
        model={model}
        interactionMode="production"
        onMarkManualsRead={handleMarkManualsRead}
      />
    </div>
  );
}
