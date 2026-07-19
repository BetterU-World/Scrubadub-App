import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="px-4 py-10 text-center sm:py-12">
      <Icon className="mx-auto h-12 w-12 text-gray-400" />
      <h3 className="mt-3 break-words text-lg font-medium text-gray-900">
        {title}
      </h3>
      <p className="mx-auto mt-1 max-w-md break-words text-sm text-gray-500">
        {description}
      </p>
      {action && <div className="mt-6 max-w-full">{action}</div>}
    </div>
  );
}
