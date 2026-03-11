import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { Shield } from "lucide-react";

export function ManagerHomePage() {
  const { user } = useAuth();

  return (
    <div>
      <PageHeader
        title="Manager Portal"
        description="Your manager dashboard is coming soon."
      />
      <div className="card p-8 text-center">
        <Shield className="w-12 h-12 text-primary-300 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Welcome, {user?.name}
        </h2>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          Your manager account is active. Job oversight, inspections, and
          management tools will be available here in an upcoming update.
        </p>
      </div>
    </div>
  );
}
