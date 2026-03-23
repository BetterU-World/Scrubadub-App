import { ClipboardCheck, Package } from "lucide-react";

interface JobWorkspaceProgressProps {
  cleaningCompleted: number;
  cleaningTotal: number;
  inventoryCompleted: number;
  inventoryTotal: number;
}

export function JobWorkspaceProgress({
  cleaningCompleted,
  cleaningTotal,
  inventoryCompleted,
  inventoryTotal,
}: JobWorkspaceProgressProps) {
  const totalRequired = cleaningTotal + inventoryTotal;
  const totalCompleted = cleaningCompleted + inventoryCompleted;
  const progressPercent = totalRequired > 0
    ? Math.round((totalCompleted / totalRequired) * 100)
    : 0;

  if (totalRequired === 0) return null;

  return (
    <div className="card space-y-3">
      {/* Unified progress bar */}
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-gray-900">Job Progress</span>
        <span className="font-medium text-gray-600">{progressPercent}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div
          className="h-2.5 rounded-full transition-all duration-300"
          style={{
            width: `${progressPercent}%`,
            backgroundColor: progressPercent === 100 ? "#16a34a" : "#6366f1",
          }}
        />
      </div>

      {/* Sub-rows */}
      <div className="flex gap-4 text-xs text-gray-600">
        {cleaningTotal > 0 && (
          <div className="flex items-center gap-1.5">
            <ClipboardCheck className="w-3.5 h-3.5 text-indigo-500" />
            <span>
              Cleaning{" "}
              <span className="font-medium text-gray-900">
                {cleaningCompleted}/{cleaningTotal}
              </span>
            </span>
          </div>
        )}
        {inventoryTotal > 0 && (
          <div className="flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5 text-indigo-500" />
            <span>
              Inventory{" "}
              <span className="font-medium text-gray-900">
                {inventoryCompleted}/{inventoryTotal}
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
