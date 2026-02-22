import { useAuth } from "@/hooks/useAuth";
import { CleanerJobDetailPage } from "@/pages/cleaner/CleanerJobDetailPage";
import { MaintenanceJobDetailPage } from "@/pages/maintenance/MaintenanceJobDetailPage";

export function WorkerJobDetailPage() {
  const { user } = useAuth();
  if (user?.role === "maintenance") return <MaintenanceJobDetailPage />;
  return <CleanerJobDetailPage />;
}
