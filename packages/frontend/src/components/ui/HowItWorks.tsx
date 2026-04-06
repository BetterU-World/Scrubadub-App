import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface HowItWorksProps {
  steps: string[];
}

export function HowItWorks({ steps }: HowItWorksProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
      >
        How it works
        <ChevronDown
          className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-2 p-4 bg-blue-50 border border-blue-100 rounded-lg text-sm text-gray-700 space-y-2">
          {steps.map((step, i) => (
            <p key={i}>{step}</p>
          ))}
        </div>
      )}
    </div>
  );
}
