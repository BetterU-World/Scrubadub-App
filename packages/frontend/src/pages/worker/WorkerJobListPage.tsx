import { useAuth } from "@/hooks/useAuth";
import { CleanerJobListPage } from "@/pages/cleaner/CleanerJobListPage";
import { MaintenanceJobListPage } from "@/pages/maintenance/MaintenanceJobListPage";

export function WorkerJobListPage() {
  const { user } = useAuth();
  if (user?.role === "maintenance") return <MaintenanceJobListPage />;
  return <CleanerJobListPage />;
}
