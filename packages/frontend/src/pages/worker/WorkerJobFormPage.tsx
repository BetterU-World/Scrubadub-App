import { useAuth } from "@/hooks/useAuth";
import { CleaningFormPage } from "@/pages/cleaner/CleaningFormPage";
import { MaintenanceFormPage } from "@/pages/maintenance/MaintenanceFormPage";

export function WorkerJobFormPage() {
  const { user } = useAuth();
  if (user?.role === "maintenance") return <MaintenanceFormPage />;
  return <CleaningFormPage />;
}
