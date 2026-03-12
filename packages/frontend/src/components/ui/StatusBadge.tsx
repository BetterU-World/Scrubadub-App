import { clsx } from "clsx";
import { useTranslation } from "react-i18next";

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
  wont_fix: "bg-gray-100 text-gray-600",
  reviewed: "bg-yellow-100 text-yellow-800",
  contacted: "bg-indigo-100 text-indigo-800",
  archived: "bg-gray-100 text-gray-600",
  quoted: "bg-yellow-100 text-yellow-800",
  won: "bg-green-100 text-green-800",
  lost: "bg-red-100 text-red-800",
};

// Map raw status strings to translation keys
const statusKeyMap: Record<string, string> = {
  active: "status.active",
  inactive: "status.inactive",
  pending: "status.pending",
  scheduled: "status.scheduled",
  confirmed: "status.confirmed",
  accepted: "status.accepted",
  denied: "status.denied",
  in_progress: "status.inProgress",
  submitted: "status.submitted",
  approved: "status.approved",
  rework_requested: "status.reworkRequested",
  cancelled: "status.cancelled",
  new: "status.new",
  declined: "status.declined",
  converted: "status.converted",
  open: "status.open",
  acknowledged: "status.acknowledged",
  resolved: "status.resolved",
  wont_fix: "status.wont_fix",
  reviewed: "status.reviewed",
  contacted: "status.contacted",
  archived: "status.archived",
  quoted: "status.quoted",
  won: "status.won",
  lost: "status.lost",
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { t } = useTranslation();
  const key = statusKeyMap[status];
  const label = key ? t(key) : status.replace(/_/g, " ");
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
