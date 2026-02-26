import { useLocation, Link } from "wouter";
import { List, Kanban } from "lucide-react";
import { clsx } from "clsx";

const views = [
  { href: "/requests", label: "List View", icon: List },
  { href: "/requests/pipeline", label: "Pipeline View", icon: Kanban },
] as const;

export function LeadsHeader() {
  const [location] = useLocation();

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage incoming requests and your sales pipeline
        </p>
      </div>
      <div className="flex rounded-lg border border-gray-200 overflow-hidden flex-shrink-0">
        {views.map((v) => {
          const isActive =
            v.href === "/requests"
              ? location === "/requests"
              : location.startsWith(v.href);
          return (
            <Link
              key={v.href}
              href={v.href}
              className={clsx(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary-50 text-primary-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <v.icon className="w-4 h-4" />
              {v.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
