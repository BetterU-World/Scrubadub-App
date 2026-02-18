import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageLoader, LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useParams, useLocation } from "wouter";
import {
  ChevronLeft,
  ChevronRight,
  Camera,
  Flag,
  Check,
  MessageSquare,
  Send,
  AlertTriangle,
  WifiOff,
  Save,
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

const MILESTONE_MESSAGES: Record<number, string> = {
  25: "Quarter done!",
  50: "Halfway there!",
  75: "Almost done!",
  100: "All items complete!",
};

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
@keyframes toastSlideOut {
  0% { transform: translateY(0); opacity: 1; }
  100% { transform: translateY(-20px); opacity: 0; }
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
.toast-exit {
  animation: toastSlideOut 0.25s ease-in forwards;
}
.banner-enter {
  animation: bannerSlideDown 0.3s ease-out forwards;
}
`;

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s so far`;
  return `${minutes} min so far`;
}

function formatTotalTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds} seconds`;
  if (seconds === 0) return `${minutes} min`;
  return `${minutes} min ${seconds}s`;
}

interface CachedFormState {
  completions: Record<string, boolean>;
  notes: Record<string, string>;
  scores: Record<string, number>;
  selfScore: number;
  currentSection: number;
  savedAt: number;
}

function getCacheKey(jobId: string): string {
  return `scrubadub_form_${jobId}`;
}

export function CleaningFormPage() {
  const params = useParams<{ id: string }>();
  const { user, sessionToken } = useAuth();
  const [, setLocation] = useLocation();

  const job = useQuery(api.queries.jobs.get,
    sessionToken ? { sessionToken, jobId: params.id as Id<"jobs"> } : "skip"
  );

  const form = useQuery(
    api.queries.forms.getByJob,
    job && sessionToken ? { sessionToken, jobId: job._id } : "skip"
  );

  const formItems = useQuery(
    api.queries.forms.getItems,
    form && sessionToken ? { sessionToken, formId: form._id } : "skip"
  );

  const updateItem = useMutation(api.mutations.forms.updateItem);
  const updateScore = useMutation(api.mutations.forms.updateScore);
  const updateFinalPass = useMutation(api.mutations.forms.updateFinalPass);
  const submitForm = useMutation(api.mutations.forms.submit);
  const createRedFlag = useMutation(api.mutations.redFlags.create);
  const generateUploadUrl = useMutation(api.mutations.storage.generateUploadUrl);

  const [currentSection, setCurrentSection] = useState(0);
  const [showNoteFor, setShowNoteFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [showRedFlag, setShowRedFlag] = useState<string | null>(null);
  const [rfCategory, setRfCategory] = useState("cleanliness");
  const [rfSeverity, setRfSeverity] = useState("medium");
  const [rfNote, setRfNote] = useState("");
  const [selfScore, setSelfScore] = useState(8);
  const [showReview, setShowReview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [showSignature, setShowSignature] = useState(false);

  // Micro-win animation state
  const [animatingItems, setAnimatingItems] = useState<Set<string>>(new Set());
  const [sectionCompleteToast, setSectionCompleteToast] = useState<string | null>(null);
  const [milestoneToast, setMilestoneToast] = useState<string | null>(null);
  const lastMilestoneRef = useRef<number>(0);

  // Speed feedback state
  const startTimeRef = useRef<number>(Date.now());
  const [elapsedDisplay, setElapsedDisplay] = useState("0s so far");
  const [totalTimeTaken, setTotalTimeTaken] = useState("");

  // Offline caching state
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [lastSavedLocally, setLastSavedLocally] = useState<number | null>(null);
  const hasMountedCacheCheck = useRef(false);

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

  // Elapsed time ticker
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedDisplay(formatElapsed(Date.now() - startTimeRef.current));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Check for cached form on mount
  useEffect(() => {
    if (hasMountedCacheCheck.current || !params.id) return;
    hasMountedCacheCheck.current = true;
    try {
      const cached = localStorage.getItem(getCacheKey(params.id));
      if (cached) {
        const parsed: CachedFormState = JSON.parse(cached);
        // Only show resume banner if cache is less than 24 hours old
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
        currentSection,
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
  }, [params.id, formItems, selfScore, currentSection]);

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
        setCurrentSection(parsed.currentSection);
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

  const sectionItems = formItems.filter((i) => i.section === SECTIONS[currentSection]);
  const totalItems = formItems.length;
  const completedItems = formItems.filter((i) => i.completed).length;
  const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  const redFlagItems = formItems.filter((i) => i.isRedFlag);

  // Check milestone triggers
  const checkMilestone = (newProgress: number) => {
    const milestones = [25, 50, 75, 100];
    for (const m of milestones) {
      if (newProgress >= m && lastMilestoneRef.current < m) {
        lastMilestoneRef.current = m;
        setMilestoneToast(MILESTONE_MESSAGES[m]);
        setTimeout(() => setMilestoneToast(null), 2000);
        break;
      }
    }
  };

  // Check if completing this item completes the section
  const checkSectionComplete = (itemId: string, willBeCompleted: boolean) => {
    const sectionName = formItems.find((i) => i._id === itemId)?.section;
    if (!sectionName) return;
    const sectionFormItems = formItems.filter((i) => i.section === sectionName);
    const willAllBeComplete = sectionFormItems.every(
      (i) => (i._id === itemId ? willBeCompleted : i.completed)
    );
    if (willAllBeComplete) {
      setSectionCompleteToast(sectionName);
      setTimeout(() => setSectionCompleteToast(null), 1500);
    }
  };

  const handleToggleItem = async (itemId: Id<"formItems">, completed: boolean) => {
    const willBeCompleted = !completed;

    // Trigger checkmark animation
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

    await updateItem({ sessionToken: sessionToken!, itemId, completed: willBeCompleted });

    // After update, check milestones and section completion
    if (willBeCompleted) {
      const newCompleted = completedItems + 1;
      const newProgress = totalItems > 0 ? Math.round((newCompleted / totalItems) * 100) : 0;
      checkMilestone(newProgress);
      checkSectionComplete(itemId, true);
    }
  };

  const handleSaveNote = async (itemId: Id<"formItems">) => {
    await updateItem({ sessionToken: sessionToken!, itemId, note: noteText || undefined });
    setShowNoteFor(null);
    setNoteText("");
  };

  const handlePhotoUpload = async (itemId: Id<"formItems">, file: File) => {
    const url = await generateUploadUrl({ sessionToken: sessionToken! });
    const result = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    const { storageId } = await result.json();
    await updateItem({ sessionToken: sessionToken!, itemId, photoStorageId: storageId });
  };

  const handleCreateRedFlag = async (itemId: Id<"formItems">) => {
    if (!rfNote.trim()) return;
    await createRedFlag({
      sessionToken: sessionToken!,
      propertyId: job.propertyId,
      jobId: job._id,
      formItemId: itemId,
      category: rfCategory as any,
      severity: rfSeverity as any,
      note: rfNote,
    });
    await updateItem({ sessionToken: sessionToken!, itemId, isRedFlag: true });
    setShowRedFlag(null);
    setRfNote("");
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError("");
    try {
      await updateScore({ sessionToken: sessionToken!, formId: form._id, cleanerScore: selfScore });
      await submitForm({ sessionToken: sessionToken!, formId: form._id });
      clearFormCache();
      setLocation(`/jobs/${job._id}`);
    } catch (err: any) {
      setSubmitError(err.message || "Failed to submit form");
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

  // Compute total time for review screen
  const totalTimeMs = Date.now() - startTimeRef.current;

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
                <span className="text-gray-500">Time taken:</span>{" "}
                <span className="font-medium">{formatTotalTime(totalTimeMs)}</span>
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

          {submitError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {submitError}
            </div>
          )}

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

      {/* Milestone toast */}
      {milestoneToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 toast-enter">
          <div className="bg-primary-600 text-white px-5 py-2.5 rounded-full shadow-lg text-sm font-semibold">
            {milestoneToast}
          </div>
        </div>
      )}

      {/* Section complete toast */}
      {sectionCompleteToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 toast-enter">
          <div className="bg-green-600 text-white px-5 py-2.5 rounded-full shadow-lg text-sm font-semibold flex items-center gap-2">
            <Check className="w-4 h-4" />
            Section complete!
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="font-medium text-gray-700">{SECTIONS[currentSection]}</span>
          <div className="flex items-center gap-3">
            {isOffline && lastSavedLocally && (
              <span className="text-xs text-amber-600 flex items-center gap-1">
                <WifiOff className="w-3 h-3" />
                Saved locally
              </span>
            )}
            <span className="text-gray-400 text-xs">{elapsedDisplay}</span>
            <span className="text-gray-500">{progress}% complete</span>
          </div>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-primary-500 h-2 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-center gap-1 mt-2">
          {SECTIONS.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentSection(i)}
              className={`w-2 h-2 rounded-full ${
                i === currentSection ? "bg-primary-500" : "bg-gray-300"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Section items */}
      <div className="space-y-2">
        {sectionItems.map((item) => (
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

                {/* Photo button */}
                <label className={`p-1.5 rounded cursor-pointer ${item.photoStorageId ? "text-green-500" : "text-gray-300 hover:text-gray-500"}`}>
                  <Camera className="w-4 h-4" />
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePhotoUpload(item._id, file);
                    }}
                  />
                </label>

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

      {/* Navigation */}
      <div className="flex items-center justify-between mt-6">
        <button
          onClick={() => setCurrentSection(Math.max(0, currentSection - 1))}
          disabled={currentSection === 0}
          className="btn-secondary flex items-center gap-1"
        >
          <ChevronLeft className="w-4 h-4" /> Previous
        </button>

        {currentSection < SECTIONS.length - 1 ? (
          <button
            onClick={() => setCurrentSection(currentSection + 1)}
            className="btn-primary flex items-center gap-1"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={() => setShowReview(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Send className="w-4 h-4" /> Review & Submit
          </button>
        )}
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
