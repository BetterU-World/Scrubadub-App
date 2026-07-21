import { ReactNode } from "react";
import { PageBack } from "./PageBack";

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  back?: {
    href: string;
    label: string;
  };
}

export function PageHeader({ title, description, action, back }: PageHeaderProps) {
  return (
    <div className="mb-6">
      {back && <PageBack href={back.href} label={back.label} className="mb-2" />}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold text-gray-900">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-gray-500">{description}</p>
          )}
        </div>
        {action && (
          <div className="min-w-0 w-full sm:w-auto sm:flex-shrink-0">
            {action}
          </div>
        )}
      </div>
    </div>
  );
}
