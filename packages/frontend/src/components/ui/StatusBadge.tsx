import { clsx } from "clsx";

const statusStyles: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  inactive: "bg-gray-100 text-gray-800",
  pending: "bg-yellow-100 text-yellow-800",
  scheduled: "bg-blue-100 text-blue-800",
  confirmed: "bg-indigo-100 text-indigo-800",
  accepted: "bg-green-100 text-green-800",
  denied: "bg-red-100 text-red-800",
  in_progress: "bg-purple-100 text-purple-800",
  submitted: "bg-teal-100 text-teal-800",
  approved: "bg-green-100 text-green-800",
  rework_requested: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-600",
  new: "bg-blue-100 text-blue-800",
  declined: "bg-red-100 text-red-800",
  converted: "bg-primary-100 text-primary-800",
  open: "bg-red-100 text-red-800",
  acknowledged: "bg-yellow-100 text-yellow-800",
  resolved: "bg-green-100 text-green-800",
  reviewed: "bg-yellow-100 text-yellow-800",
  contacted: "bg-indigo-100 text-indigo-800",
  archived: "bg-gray-100 text-gray-600",
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const label = status.replace(/_/g, " ");
  return (
    <span
      className={clsx(
        "badge capitalize",
        statusStyles[status] || "bg-gray-100 text-gray-800",
        className
      )}
    >
      {label}
    </span>
  );
}
