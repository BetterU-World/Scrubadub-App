import { useState } from "react";
import { Link } from "wouter";
import { PageHeader } from "@/components/ui/PageHeader";
import { Users, Sparkles, CheckCircle } from "lucide-react";

const LS_MANUAL_READ = "scrubadub_onboarding_manual_read";

const manuals = [
  {
    slug: "owner",
    title: "Owner Manual",
    description: "Managing properties, employees, jobs, and reports.",
    icon: Users,
  },
  {
    slug: "cleaner",
    title: "Cleaner Manual",
    description: "Accepting jobs, completing forms, and daily workflow.",
    icon: Sparkles,
  },
];

export function ManualsPage() {
  const [manualRead, setManualRead] = useState(
    () => localStorage.getItem(LS_MANUAL_READ) === "1"
  );

  return (
    <div>
      <PageHeader
        title="Manuals"
        description="Gold standard guides for using ScrubaDub"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        {manuals.map((m) => (
          <Link
            key={m.slug}
            href={`/manuals/${m.slug}`}
            className="card hover:shadow-md transition-shadow cursor-pointer block"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary-100 text-primary-600">
                <m.icon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{m.title}</h3>
                <p className="text-sm text-gray-500 mt-1">{m.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-6 max-w-2xl">
        {manualRead ? (
          <div className="flex items-center gap-2 text-sm text-primary-700">
            <CheckCircle className="w-4 h-4" />
            Manual marked as read
          </div>
        ) : (
          <button
            onClick={() => {
              localStorage.setItem(LS_MANUAL_READ, "1");
              setManualRead(true);
            }}
            className="btn-primary text-sm px-4 py-2"
          >
            Mark manual as read
          </button>
        )}
      </div>
    </div>
  );
}
