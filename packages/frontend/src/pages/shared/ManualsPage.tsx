import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useAction, useMutation } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { getStaffSessionToken, useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { BookOpen, ExternalLink, Users, Sparkles, AppWindow, BookMarked, Upload, Download, X, Check } from "lucide-react";

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
      const res = await seedManuals({
        userId: userId as any,
        sessionToken: getStaffSessionToken(),
        manuals: parsed as any,
      });
      setResult(res);
    } catch (e: any) {
      setError(e.message ?? "Seed failed");
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative max-h-[calc(100dvh-2rem)] w-full min-w-0 max-w-lg overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6">
        <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
          <h2 className="min-w-0 break-words text-lg font-semibold text-gray-900">{t("manuals.seedManuals")}</h2>
          <button onClick={onClose} className="touch-target flex shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label={t("common.closeDialog")}>
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
          className="input-field h-48 max-w-full resize-none font-mono text-xs"
        />

        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}
        {result && (
          <p className="mt-2 text-sm text-green-700">
            {t("manuals.seedDone", { inserted: result.inserted, updated: result.updated })}
          </p>
        )}

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button onClick={onClose} className="btn-secondary touch-target w-full text-sm sm:w-auto">{t("common.cancel")}</button>
          <button
            onClick={handleSeed}
            disabled={seeding || !json.trim()}
            className="btn-primary touch-target flex w-full items-center justify-center gap-1.5 text-sm sm:w-auto"
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
  const { user, sessionToken } = useAuth();
  const manuals = useQuery(
    api.queries.manuals.getVisibleManuals,
    user && sessionToken ? { userId: user._id, sessionToken } : "skip"
  );
  const exportedManuals = useQuery(
    api.queries.manuals.exportManuals,
    user?.isSuperadmin && sessionToken
      ? { userId: user._id, sessionToken }
      : "skip"
  );
  const getSignedUrl = useAction(api.actions.manuals.getManualSignedUrl);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [showSeed, setShowSeed] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleExport = () => {
    if (!exportedManuals) return;
    const json = JSON.stringify(exportedManuals, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!user || manuals === undefined) return <PageLoader />;

  const grouped: Record<string, typeof manuals> = {};
  for (const m of manuals) {
    (grouped[m.category] ??= []).push(m);
  }

  const handleOpen = async (manualId: typeof manuals[number]["_id"]) => {
    setLoadingId(manualId);
    try {
      const { url } = await getSignedUrl({ userId: user._id, sessionToken: getStaffSessionToken(), manualId });
      window.open(url, "_blank");
    } catch {
      // action threw — access denied or not found
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="min-w-0 max-w-full">
      <PageHeader
        title={t("manuals.title")}
        description={t("guidance.worker.manuals")}
        action={
          user.isSuperadmin && (
            <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
              <button
                onClick={handleExport}
                disabled={!exportedManuals || exportedManuals.length === 0}
                className="btn-secondary touch-target flex w-full items-center justify-center gap-1.5 text-sm sm:w-auto"
              >
                {copied ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                {copied ? t("manuals.exportCopied") : t("manuals.exportManuals")}
              </button>
              <button
                onClick={() => setShowSeed(true)}
                className="btn-secondary touch-target flex w-full items-center justify-center gap-1.5 text-sm sm:w-auto"
              >
                <Upload className="w-4 h-4" /> {t("manuals.seedManuals")}
              </button>
            </div>
          )
        }
      />
      <div className="w-full min-w-0 max-w-2xl space-y-8">
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
                className="card flex min-w-0 flex-col items-stretch gap-3 transition-shadow hover:shadow-md sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="w-full min-w-0">
                  <p className="break-words font-medium text-gray-900 sm:truncate">{t("manuals.ownerGuide")}</p>
                  <p className="mt-0.5 break-words text-sm text-gray-500 sm:truncate">
                    {t("manuals.ownerGuideDesc")}
                  </p>
                </div>
                <span className="btn-secondary touch-target flex w-full flex-shrink-0 items-center justify-center gap-1.5 text-sm sm:w-auto">
                  <BookOpen className="w-4 h-4" /> {t("manuals.read")}
                </span>
              </Link>
            )}
            <Link
              href="/manuals/cleaner"
              className="card flex min-w-0 flex-col items-stretch gap-3 transition-shadow hover:shadow-md sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <div className="w-full min-w-0">
                <p className="break-words font-medium text-gray-900 sm:truncate">{t("manuals.cleanerGuide")}</p>
                <p className="mt-0.5 break-words text-sm text-gray-500 sm:truncate">
                  {t("manuals.cleanerGuideDesc")}
                </p>
              </div>
              <span className="btn-secondary touch-target flex w-full flex-shrink-0 items-center justify-center gap-1.5 text-sm sm:w-auto">
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
                      className="card flex min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                    >
                      <div className="w-full min-w-0">
                        <p className="break-words font-medium text-gray-900 sm:truncate">
                          {m.title}
                        </p>
                        {m.description && (
                          <p className="mt-0.5 break-words text-sm text-gray-500 sm:truncate">
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
                        className="btn-secondary touch-target flex w-full flex-shrink-0 items-center justify-center gap-1.5 text-sm sm:w-auto"
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
