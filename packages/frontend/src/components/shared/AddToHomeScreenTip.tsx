import { useState } from "react";
import { Smartphone, X } from "lucide-react";

const LS_KEY = "scrubadub_a2hs_dismissed";

export function AddToHomeScreenTip() {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(LS_KEY) === "1",
  );

  if (dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(LS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="md:hidden mb-4 rounded-xl border border-primary-200 bg-primary-50 p-4">
      <div className="flex items-start gap-3">
        <Smartphone className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">
            Use SCRUB like an app
          </p>
          <p className="text-xs text-gray-600 mt-1">
            Add SCRUB to your home screen for faster access and a cleaner
            full-screen experience.
          </p>
          <ul className="mt-2 space-y-1 text-xs text-gray-600">
            <li>
              <span className="font-medium text-gray-700">iPhone:</span> Tap
              Share → Add to Home Screen
            </li>
            <li>
              <span className="font-medium text-gray-700">Android:</span> Tap
              browser menu → Add to Home screen
            </li>
          </ul>
          <button
            onClick={handleDismiss}
            className="mt-3 text-xs font-medium text-primary-700 hover:text-primary-800"
          >
            Got it
          </button>
        </div>
        <button
          onClick={handleDismiss}
          className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-primary-100 flex-shrink-0"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
