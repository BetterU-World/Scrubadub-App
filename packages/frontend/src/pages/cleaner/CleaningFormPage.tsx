import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageLoader, LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useParams, useLocation } from "wouter";
import {
  ChevronLeft,
  Flag,
  Check,
  MessageSquare,
  Send,
  AlertTriangle,
  WifiOff,
  Save,
  Zap,
  ImagePlus,
} from "lucide-react";

const SECTIONS = [
  "General Property Check",
  "Bathroom Gold Standard",
  "Kitchen Gold Standard",
  "Living Area / Bedroom",
  "Floors (Final Step)",
  "Exterior / Patio (if applicable)",
  "Final Walkthrough (Client Perspective)",
];

// Inline keyframes for micro-win animations
const animationStyles = `
@keyframes checkPulse {
  0% { transform: scale(1); }
  40% { transform: scale(1.3); }
  70% { transform: scale(0.95); }
  100% { transform: scale(1); }
}
@keyframes confettiPulse {
  0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5); }
  70% { box-shadow: 0 0 0 8px rgba(34, 197, 94, 0); }
  100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
}
@keyframes toastSlideIn {
  0% { transform: translateY(-20px); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}
@keyframes bannerSlideDown {
  0% { max-height: 0; opacity: 0; }
  100% { max-height: 60px; opacity: 1; }
}
.check-pulse {
  animation: checkPulse 0.35s ease-out, confettiPulse 0.5s ease-out;
}
.toast-enter {
  animation: toastSlideIn 0.25s ease-out forwards;
}
.banner-enter {
  animation: bannerSlideDown 0.3s ease-out forwards;
}
`;

interface CachedFormState {
  completions: Record<string, boolean>;
  notes: Record<string, string>;
  scores: Record<string, number>;
  selfScore: number;
  savedAt: number;
}

function getCacheKey(jobId: string): string {
  return `scrubadub_form_${jobId}`;
}

export function CleaningFormPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const job = useQuery(api.queries.jobs.get,
    user ? { jobId: params.id as Id<"jobs">, userId: user._id } : "skip"
  );

  const form = useQuery(
    api.queries.forms.getByJob,
    job && user ? { jobId: job._id, userId: user._id } : "skip"
  );

  const formItems = useQuery(
    api.queries.forms.getItems,
    form && user ? { formId: form._id, userId: user._id } : "skip"
  );

  const updateItem = useMutation(api.mutations.forms.updateItem);
  const updateScore = useMutation(api.mutations.forms.updateScore);
  const submitForm = useMutation(api.mutations.forms.submit);
  const createRedFlag = useMutation(api.mutations.redFlags.create);
  const generateUploadUrl = useMutation(api.mutations.storage.generateUploadUrl);
  const markAllComplete = useMutation(api.mutations.forms.markAllComplete);
  const addPhoto = useMutation(api.mutations.forms.addPhoto);

  const [showNoteFor, setShowNoteFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [showRedFlag, setShowRedFlag] = useState<string | null>(null);
  const [rfCategory, setRfCategory] = useState("cleanliness");
  const [rfSeverity, setRfSeverity] = useState("medium");
  const [rfNote, setRfNote] = useState("");
  const [selfScore, setSelfScore] = useState(8);
  const [showReview, setShowReview] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Fast mode
  const [fastMode, setFastMode] = useState(true);
  const fastModeInitRef = useRef(false);

  // Micro-win animation state
  const [animatingItems, setAnimatingItems] = useState<Set<string>>(new Set());

  // Offline caching state
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [lastSavedLocally, setLastSavedLocally] = useState<number | null>(null);
  const hasMountedCacheCheck = useRef(false);

  // Photo upload state
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Signature canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Fast Mode: batch-mark all items complete on first load
  useEffect(() => {
    if (
      !fastMode ||
      fastModeInitRef.current ||
      !form ||
      !formItems ||
      formItems.length === 0 ||
      !user
    )
      return;
    const hasUncompleted = formItems.some((i) => !i.completed);
    if (hasUncompleted) {
      fastModeInitRef.current = true;
      markAllComplete({ formId: form._id, userId: user._id });
    } else {
      fastModeInitRef.current = true;
    }
  }, [fastMode, form, formItems, user]);

  // Check for cached form on mount
  useEffect(() => {
    if (hasMountedCacheCheck.current || !params.id) return;
    hasMountedCacheCheck.current = true;
    try {
      const cached = localStorage.getItem(getCacheKey(params.id));
      if (cached) {
        const parsed: CachedFormState = JSON.parse(cached);
        if (Date.now() - parsed.savedAt < 24 * 60 * 60 * 1000) {
          setShowResumeBanner(true);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, [params.id]);

  // Save form state to localStorage on item updates
  const saveToLocalStorage = useCallback(() => {
    if (!params.id || !formItems) return;
    try {
      const state: CachedFormState = {
        completions: {},
        notes: {},
        scores: {},
        selfScore,
        savedAt: Date.now(),
      };
      for (const item of formItems) {
        state.completions[item._id] = item.completed;
        if (item.note) state.notes[item._id] = item.note;
      }
      localStorage.setItem(getCacheKey(params.id), JSON.stringify(state));
      setLastSavedLocally(Date.now());
    } catch {
      // localStorage full or unavailable
    }
  }, [params.id, formItems, selfScore]);

  // Auto-save whenever formItems change
  useEffect(() => {
    if (formItems && formItems.length > 0) {
      saveToLocalStorage();
    }
  }, [formItems, saveToLocalStorage]);

  const handleResumeFromCache = () => {
    if (!params.id) return;
    try {
      const cached = localStorage.getItem(getCacheKey(params.id));
      if (cached) {
        const parsed: CachedFormState = JSON.parse(cached);
        setSelfScore(parsed.selfScore);
      }
    } catch {
      // Ignore
    }
    setShowResumeBanner(false);
  };

  const handleDismissResumeBanner = () => {
    if (params.id) {
      localStorage.removeItem(getCacheKey(params.id));
    }
    setShowResumeBanner(false);
  };

  const clearFormCache = useCallback(() => {
    if (params.id) {
      try {
        localStorage.removeItem(getCacheKey(params.id));
      } catch {
        // Ignore
      }
    }
  }, [params.id]);

  if (!user || job === undefined || form === undefined || formItems === undefined) {
    return <PageLoader />;
  }

  if (!job || !form) {
    return <div className="text-center py-12 text-gray-500">Form not found</div>;
  }

  const totalItems = formItems.length;
  const completedItems = formItems.filter((i) => i.completed).length;
  const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  const redFlagItems = formItems.filter((i) => i.isRedFlag);
  const photoCount = (form as any).photoStorageIds?.length ?? 0;

  const handleToggleItem = async (itemId: Id<"formItems">, completed: boolean) => {
    const willBeCompleted = !completed;

    if (willBeCompleted) {
      setAnimatingItems((prev) => new Set(prev).add(itemId));
      setTimeout(() => {
        setAnimatingItems((prev) => {
          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
      }, 500);
    }

    await updateItem({ itemId, completed: willBeCompleted, userId: user!._id });
  };

  const handleSaveNote = async (itemId: Id<"formItems">) => {
    await updateItem({ itemId, note: noteText || undefined, userId: user!._id });
    setShowNoteFor(null);
    setNoteText("");
  };

  const handleGlobalPhotoUpload = async (file: File) => {
    if (!form) return;
    setUploadingPhoto(true);
    try {
      const url = await generateUploadUrl({ userId: user!._id });
      const result = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await result.json();
      await addPhoto({ formId: form._id, photoStorageId: storageId, userId: user!._id });
    } catch (err) {
      console.error(err);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleCreateRedFlag = async (itemId: Id<"formItems">) => {
    if (!rfNote.trim()) return;
    await createRedFlag({
      companyId: job.companyId,
      propertyId: job.propertyId,
      jobId: job._id,
      formItemId: itemId,
      category: rfCategory as any,
      severity: rfSeverity as any,
      note: rfNote,
      userId: user!._id,
    });
    await updateItem({ itemId, isRedFlag: true, userId: user!._id });
    setShowRedFlag(null);
    setRfNote("");
  };

  const handleToggleFastMode = async () => {
    const next = !fastMode;
    setFastMode(next);
    if (next && form) {
      await markAllComplete({ formId: form._id, userId: user!._id });
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await updateScore({ formId: form._id, cleanerScore: selfScore, userId: user!._id });
      await submitForm({ formId: form._id, userId: user!._id });
      clearFormCache();
      setLocation(`/jobs/${job._id}`);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  // Signature drawing helpers
  const startDraw = (x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    isDrawingRef.current = true;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const draw = (x: number, y: number) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    ctx.stroke();
  };
  const stopDraw = () => { isDrawingRef.current = false; };

  // ---------- Review Screen ----------
  if (showReview) {
    return (
      <div className="max-w-2xl mx-auto pb-8">
        <style>{animationStyles}</style>

        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setShowReview(false)} className="p-2 hover:bg-gray-100 rounded-lg">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold">Review & Submit</h1>
        </div>

        <div className="space-y-4">
          {/* Summary */}
          <div className="card">
            <h3 className="font-semibold mb-2">Summary</h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Completed:</span>{" "}
                <span className="font-medium">{completedItems}/{totalItems}</span>
              </div>
              <div>
                <span className="text-gray-500">Red Flags:</span>{" "}
                <span className="font-medium text-red-600">{redFlagItems.length}</span>
              </div>
              <div>
                <span className="text-gray-500">Photos:</span>{" "}
                <span className="font-medium">{photoCount}</span>
              </div>
            </div>
          </div>

          {/* Self Score */}
          <div className="card">
            <h3 className="font-semibold mb-3">Self-Score</h3>
            <p className="text-sm text-gray-500 mb-2">Rate your work (1-10)</p>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={1}
                max={10}
                value={selfScore}
                onChange={(e) => setSelfScore(parseInt(e.target.value))}
                className="flex-1"
              />
              <span className="text-2xl font-bold text-primary-600 w-10 text-center">{selfScore}</span>
            </div>
          </div>

          {/* Signature */}
          <div className="card">
            <h3 className="font-semibold mb-3">Signature</h3>
            <div className="border-2 border-dashed border-gray-300 rounded-lg overflow-hidden">
              <canvas
                ref={canvasRef}
                width={400}
                height={150}
                className="w-full bg-white touch-none"
                onMouseDown={(e) => startDraw(e.nativeEvent.offsetX, e.nativeEvent.offsetY)}
                onMouseMove={(e) => draw(e.nativeEvent.offsetX, e.nativeEvent.offsetY)}
                onMouseUp={stopDraw}
                onMouseLeave={stopDraw}
                onTouchStart={(e) => {
                  const rect = canvasRef.current!.getBoundingClientRect();
                  const t = e.touches[0];
                  startDraw(t.clientX - rect.left, t.clientY - rect.top);
                }}
                onTouchMove={(e) => {
                  const rect = canvasRef.current!.getBoundingClientRect();
                  const t = e.touches[0];
                  draw(t.clientX - rect.left, t.clientY - rect.top);
                }}
                onTouchEnd={stopDraw}
              />
            </div>
            <button
              onClick={() => {
                const canvas = canvasRef.current;
                if (canvas) {
                  const ctx = canvas.getContext("2d");
                  ctx?.clearRect(0, 0, canvas.width, canvas.height);
                }
              }}
              className="text-sm text-gray-500 mt-2 hover:text-gray-700"
            >
              Clear signature
            </button>
          </div>

          {/* Section by section review */}
          {SECTIONS.map((section) => {
            const items = formItems.filter((i) => i.section === section);
            const done = items.filter((i) => i.completed).length;
            return (
              <div key={section} className="card">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-sm">{section}</h3>
                  <span className="text-xs text-gray-400">{done}/{items.length}</span>
                </div>
                <div className="space-y-1">
                  {items.map((item) => (
                    <div key={item._id} className={`flex items-center gap-2 text-sm ${item.isRedFlag ? "text-red-600" : ""}`}>
                      <span>{item.completed ? "\u2713" : "\u25CB"}</span>
                      <span className={item.completed ? "text-gray-700" : "text-gray-400"}>{item.itemName}</span>
                      {item.isRedFlag && <Flag className="w-3 h-3 text-red-500" />}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="btn-primary w-full py-3 text-lg flex items-center justify-center gap-2"
          >
            {submitting ? <LoadingSpinner size="sm" /> : <Send className="w-5 h-5" />}
            Submit for Review
          </button>
        </div>
      </div>
    );
  }

  // ---------- Main Form ----------
  return (
    <div className="max-w-2xl mx-auto pb-8">
      <style>{animationStyles}</style>

      {/* Resume from cache banner */}
      {showResumeBanner && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3 banner-enter">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-blue-800">
              <Save className="w-4 h-4" />
              <span>Resume from where you left off?</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleResumeFromCache}
                className="text-xs font-medium text-blue-700 hover:text-blue-900 px-2 py-1 rounded bg-blue-100 hover:bg-blue-200"
              >
                Resume
              </button>
              <button
                onClick={handleDismissResumeBanner}
                className="text-xs font-medium text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
              >
                Start fresh
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fast Mode toggle */}
      <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-600" />
          <span className="text-sm font-medium text-amber-800">Fast Mode (Recommended)</span>
        </div>
        <button
          onClick={handleToggleFastMode}
          className={`relative w-11 h-6 rounded-full transition-colors ${fastMode ? "bg-amber-500" : "bg-gray-300"}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${fastMode ? "translate-x-5" : ""}`} />
        </button>
      </div>
      {fastMode && (
        <p className="text-xs text-gray-500 mb-4 -mt-2 px-1">
          All items pre-checked. Just scroll and flag exceptions.
        </p>
      )}

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="font-medium text-gray-700">Checklist</span>
          <div className="flex items-center gap-3">
            {isOffline && lastSavedLocally && (
              <span className="text-xs text-amber-600 flex items-center gap-1">
                <WifiOff className="w-3 h-3" />
                Saved locally
              </span>
            )}
            <span className="text-gray-500">{progress}% complete</span>
          </div>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-primary-500 h-2 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* All sections — single scroll */}
      <div className="space-y-6">
        {SECTIONS.map((section) => {
          const items = formItems.filter((i) => i.section === section);
          return (
            <div key={section}>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">{section}</h2>
              <div className="space-y-2">
                {items.map((item) => (
                  <div
                    key={item._id}
                    className={`card py-3 px-4 ${item.isRedFlag ? "border-red-200 bg-red-50/30" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleToggleItem(item._id, item.completed)}
                        className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                          item.completed
                            ? "bg-primary-500 border-primary-500 text-white"
                            : "border-gray-300"
                        } ${animatingItems.has(item._id) ? "check-pulse" : ""}`}
                      >
                        {item.completed && <Check className="w-4 h-4" />}
                      </button>

                      <span className={`flex-1 text-sm ${item.completed ? "text-gray-700" : "text-gray-500"}`}>
                        {item.itemName}
                      </span>

                      <div className="flex items-center gap-1">
                        {/* Note button */}
                        <button
                          onClick={() => { setShowNoteFor(item._id); setNoteText(item.note ?? ""); }}
                          className={`p-1.5 rounded ${item.note ? "text-blue-500" : "text-gray-300 hover:text-gray-500"}`}
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>

                        {/* Red flag button */}
                        <button
                          onClick={() => { setShowRedFlag(item._id); setRfNote(""); }}
                          className={`p-1.5 rounded ${item.isRedFlag ? "text-red-500" : "text-gray-300 hover:text-gray-500"}`}
                        >
                          <Flag className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {item.note && (
                      <p className="text-xs text-gray-500 mt-1 ml-9">{item.note}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Attach Photos (optional, end of form) */}
      <div className="mt-6 card">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
          <ImagePlus className="w-5 h-5 text-gray-400" /> Attach Photos (Optional)
        </h3>
        <p className="text-xs text-gray-500 mb-3">Add photos of the completed cleaning. Not required.</p>
        {photoCount > 0 && (
          <p className="text-sm text-green-600 font-medium mb-2">{photoCount} photo(s) attached</p>
        )}
        <label className={`btn-secondary inline-flex items-center gap-2 cursor-pointer ${uploadingPhoto ? "opacity-50" : ""}`}>
          {uploadingPhoto ? <LoadingSpinner size="sm" /> : <ImagePlus className="w-4 h-4" />}
          {uploadingPhoto ? "Uploading..." : "Add Photo"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={uploadingPhoto}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleGlobalPhotoUpload(file);
            }}
          />
        </label>
      </div>

      {/* Review & Submit */}
      <div className="mt-6">
        <button
          onClick={() => setShowReview(true)}
          className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-lg"
        >
          <Send className="w-5 h-5" /> Review & Submit
        </button>
      </div>

      {/* Note modal */}
      {showNoteFor && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white rounded-t-xl sm:rounded-xl p-6 w-full max-w-md">
            <h3 className="font-semibold mb-3">Add Note</h3>
            <textarea
              className="input-field"
              rows={3}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add a note..."
              autoFocus
            />
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setShowNoteFor(null)} className="btn-secondary">Cancel</button>
              <button onClick={() => handleSaveNote(showNoteFor as Id<"formItems">)} className="btn-primary">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Red flag modal */}
      {showRedFlag && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white rounded-t-xl sm:rounded-xl p-6 w-full max-w-md">
            <h3 className="font-semibold text-red-700 flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5" /> Report Red Flag
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select className="input-field" value={rfCategory} onChange={(e) => setRfCategory(e.target.value)}>
                  <option value="damage">Damage</option>
                  <option value="safety">Safety</option>
                  <option value="cleanliness">Cleanliness</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
                <select className="input-field" value={rfSeverity} onChange={(e) => setRfSeverity(e.target.value)}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  className="input-field"
                  rows={3}
                  value={rfNote}
                  onChange={(e) => setRfNote(e.target.value)}
                  placeholder="Describe the issue..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setShowRedFlag(null)} className="btn-secondary">Cancel</button>
              <button
                onClick={() => handleCreateRedFlag(showRedFlag as Id<"formItems">)}
                disabled={!rfNote.trim()}
                className="btn-danger flex items-center gap-1"
              >
                <Flag className="w-4 h-4" /> Report Flag
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
