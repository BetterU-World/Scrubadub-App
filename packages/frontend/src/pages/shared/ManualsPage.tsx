import { useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { BookOpen, ExternalLink, Users, Sparkles, AppWindow } from "lucide-react";

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

      {manuals.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No manuals yet"
          description="Manuals added by your admin will appear here."
        />
      ) : (
        <div className="space-y-8 max-w-2xl">
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
      )}
    </div>
  );
}
