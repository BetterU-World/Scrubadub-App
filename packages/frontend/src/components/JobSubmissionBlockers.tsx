import { AlertCircle } from "lucide-react";

interface JobSubmissionBlockersProps {
  remainingCleaningCount: number;
  remainingInventoryCount: number;
  formCompleted: boolean;
}

export function JobSubmissionBlockers({
  remainingCleaningCount,
  remainingInventoryCount,
  formCompleted,
}: JobSubmissionBlockersProps) {
  if (remainingCleaningCount === 0 && remainingInventoryCount === 0 && formCompleted) {
    return null;
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-amber-800">
          <p className="font-medium">Cannot submit yet</p>
          <ul className="mt-1 space-y-0.5 text-xs text-amber-700">
            {!formCompleted && (
              <li>Cleaning checklist not completed</li>
            )}
            {remainingInventoryCount > 0 && (
              <li>
                {remainingInventoryCount} required inventory item{remainingInventoryCount !== 1 ? "s" : ""} remaining
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
