import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { BookOpen, ExternalLink, Users, Sparkles, AppWindow, BookMarked } from "lucide-react";

const CATEGORY_META: Record<string, { label: string; icon: typeof BookOpen }> = {
  app: { label: "App Guides", icon: AppWindow },
  cleaner: { label: "Cleaner Manuals", icon: Sparkles },
  owner: { label: "Owner Manuals", icon: Users },
};

const CATEGORY_ORDER = ["app", "cleaner", "owner"];

export function ManualsPage() {
  const { user } = useAuth();
  const manuals = useQuery(
    api.queries.manuals.getVisibleManuals,
    user ? { userId: user._id } : "skip"
  );
  const getSignedUrl = useAction(api.actions.manuals.getManualSignedUrl);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  if (!user || manuals === undefined) return <PageLoader />;

  const grouped: Record<string, typeof manuals> = {};
  for (const m of manuals) {
    (grouped[m.category] ??= []).push(m);
  }

  const handleOpen = async (manualId: typeof manuals[number]["_id"]) => {
    setLoadingId(manualId);
    try {
      const { url } = await getSignedUrl({ userId: user._id, manualId });
      window.open(url, "_blank");
    } catch {
      // action threw — access denied or not found
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Manuals"
        description="Role-gated guides and reference documents"
      />

      <div className="space-y-8 max-w-2xl">
        {/* Static in-app guides */}
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            <BookMarked className="w-4 h-4" />
            Using Scrubadub
          </h2>
          <div className="space-y-2">
            {user.role === "owner" && (
              <Link
                href="/manuals/owner"
                className="card flex items-center justify-between gap-4 hover:shadow-md transition-shadow"
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">Owner App Guide</p>
                  <p className="text-sm text-gray-500 mt-0.5 truncate">
                    Managing properties, employees, jobs, and reports
                  </p>
                </div>
                <span className="btn-secondary flex items-center gap-1.5 text-sm flex-shrink-0">
                  <BookOpen className="w-4 h-4" /> Read
                </span>
              </Link>
            )}
            <Link
              href="/manuals/cleaner"
              className="card flex items-center justify-between gap-4 hover:shadow-md transition-shadow"
            >
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">Cleaner App Guide</p>
                <p className="text-sm text-gray-500 mt-0.5 truncate">
                  Accepting jobs, completing forms, and daily workflow
                </p>
              </div>
              <span className="btn-secondary flex items-center gap-1.5 text-sm flex-shrink-0">
                <BookOpen className="w-4 h-4" /> Read
              </span>
            </Link>
          </div>
        </section>

        {/* DB-backed PDF manuals */}
        {CATEGORY_ORDER.filter((cat) => grouped[cat]?.length).map((cat) => {
            const meta = CATEGORY_META[cat] ?? { label: cat, icon: BookOpen };
            const Icon = meta.icon;
            return (
              <section key={cat}>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  <Icon className="w-4 h-4" />
                  {meta.label}
                </h2>
                <div className="space-y-2">
                  {grouped[cat].map((m) => (
                    <div
                      key={m._id}
                      className="card flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">
                          {m.title}
                        </p>
                        {m.description && (
                          <p className="text-sm text-gray-500 mt-0.5 truncate">
                            {m.description}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleOpen(m._id)}
                        disabled={loadingId === m._id}
                        className="btn-secondary flex items-center gap-1.5 text-sm flex-shrink-0"
                      >
                        <ExternalLink className="w-4 h-4" />
                        {loadingId === m._id ? "Opening…" : "Open"}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
      </div>
    </div>
  );
}
