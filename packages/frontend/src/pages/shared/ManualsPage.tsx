import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useAction, useMutation } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { BookOpen, ExternalLink, Users, Sparkles, AppWindow, BookMarked, Upload, X } from "lucide-react";

const CATEGORY_META: Record<string, { labelKey: string; icon: typeof BookOpen }> = {
  app: { labelKey: "manuals.categoryApp", icon: AppWindow },
  cleaner: { labelKey: "manuals.categoryCleaner", icon: Sparkles },
  owner: { labelKey: "manuals.categoryOwner", icon: Users },
};

const CATEGORY_ORDER = ["app", "cleaner", "owner"];

function SeedManualsModal({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const seedManuals = useMutation(api.mutations.manuals.seedManuals);
  const [json, setJson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ inserted: number; updated: number } | null>(null);
  const [seeding, setSeeding] = useState(false);

  const handleSeed = async () => {
    setError(null);
    setResult(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      setError(t("manuals.invalidJson"));
      return;
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      setError(t("manuals.expectedArray"));
      return;
    }

    for (let i = 0; i < parsed.length; i++) {
      const m = parsed[i];
      if (!m.title || typeof m.title !== "string") {
        setError(`Item ${i}: missing or invalid "title"`);
        return;
      }
      if (!m.blobKey || typeof m.blobKey !== "string") {
        setError(`Item ${i}: missing or invalid "blobKey"`);
        return;
      }
      if (!["cleaner", "owner", "app"].includes(m.category)) {
        setError(`Item ${i}: category must be "cleaner", "owner", or "app"`);
        return;
      }
      if (!["cleaner", "owner", "both"].includes(m.roleVisibility)) {
        setError(`Item ${i}: roleVisibility must be "cleaner", "owner", or "both"`);
        return;
      }
    }

    setSeeding(true);
    try {
      const res = await seedManuals({ userId: userId as any, manuals: parsed as any });
      setResult(res);
    } catch (e: any) {
      setError(e.message ?? "Seed failed");
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{t("manuals.seedManuals")}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-500 mb-3">
          {t("manuals.seedModalDesc")}
        </p>

        <textarea
          value={json}
          onChange={(e) => { setJson(e.target.value); setError(null); setResult(null); }}
          placeholder={`[\n  {\n    "title": "Cleaner Onboarding",\n    "category": "cleaner",\n    "roleVisibility": "both",\n    "blobKey": "https://…blob…/file.pdf"\n  }\n]`}
          className="input-field font-mono text-xs h-48 resize-none"
        />

        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}
        {result && (
          <p className="mt-2 text-sm text-green-700">
            {t("manuals.seedDone", { inserted: result.inserted, updated: result.updated })}
          </p>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="btn-secondary text-sm">{t("common.cancel")}</button>
          <button
            onClick={handleSeed}
            disabled={seeding || !json.trim()}
            className="btn-primary text-sm flex items-center gap-1.5"
          >
            <Upload className="w-4 h-4" />
            {seeding ? t("manuals.seeding") : t("manuals.seed")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ManualsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const manuals = useQuery(
    api.queries.manuals.getVisibleManuals,
    user ? { userId: user._id } : "skip"
  );
  const getSignedUrl = useAction(api.actions.manuals.getManualSignedUrl);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [showSeed, setShowSeed] = useState(false);

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
        title={t("manuals.title")}
        description={t("manuals.description")}
        action={
          user.isSuperadmin && (
            <button
              onClick={() => setShowSeed(true)}
              className="btn-secondary flex items-center gap-1.5 text-sm"
            >
              <Upload className="w-4 h-4" /> {t("manuals.seedManuals")}
            </button>
          )
        }
      />

      <div className="space-y-8 max-w-2xl">
        <p className="text-xs text-gray-400">{t("manuals.lastUpdated", { date: "March 1, 2026" })}</p>

        {/* Static in-app guides */}
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            <BookMarked className="w-4 h-4" />
            {t("manuals.usingApp")}
          </h2>
          <div className="space-y-2">
            {user.role === "owner" && (
              <Link
                href="/manuals/owner"
                className="card flex items-center justify-between gap-4 hover:shadow-md transition-shadow"
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">{t("manuals.ownerGuide")}</p>
                  <p className="text-sm text-gray-500 mt-0.5 truncate">
                    {t("manuals.ownerGuideDesc")}
                  </p>
                </div>
                <span className="btn-secondary flex items-center gap-1.5 text-sm flex-shrink-0">
                  <BookOpen className="w-4 h-4" /> {t("manuals.read")}
                </span>
              </Link>
            )}
            <Link
              href="/manuals/cleaner"
              className="card flex items-center justify-between gap-4 hover:shadow-md transition-shadow"
            >
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">{t("manuals.cleanerGuide")}</p>
                <p className="text-sm text-gray-500 mt-0.5 truncate">
                  {t("manuals.cleanerGuideDesc")}
                </p>
              </div>
              <span className="btn-secondary flex items-center gap-1.5 text-sm flex-shrink-0">
                <BookOpen className="w-4 h-4" /> {t("manuals.read")}
              </span>
            </Link>
          </div>
        </section>

        {/* DB-backed PDF manuals */}
        {CATEGORY_ORDER.filter((cat) => grouped[cat]?.length).map((cat) => {
            const meta = CATEGORY_META[cat] ?? { labelKey: cat, icon: BookOpen };
            const Icon = meta.icon;
            return (
              <section key={cat}>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  <Icon className="w-4 h-4" />
                  {t(meta.labelKey)}
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
                        <p className="text-xs text-gray-400 mt-0.5">
                          {t("manuals.uploaded", { date: new Date(m.createdAt).toLocaleDateString() })}
                        </p>
                      </div>
                      <button
                        onClick={() => handleOpen(m._id)}
                        disabled={loadingId === m._id}
                        className="btn-secondary flex items-center gap-1.5 text-sm flex-shrink-0"
                      >
                        <ExternalLink className="w-4 h-4" />
                        {loadingId === m._id ? t("manuals.opening") : t("manuals.open")}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
      </div>

      {showSeed && (
        <SeedManualsModal userId={user._id as string} onClose={() => setShowSeed(false)} />
      )}
    </div>
  );
}
