import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageLoader, LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useParams, useLocation } from "wouter";
import { Check, Send, ImagePlus, ChevronLeft, MessageSquare } from "lucide-react";

export function MaintenanceFormPage() {
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
  const submitForm = useMutation(api.mutations.forms.submit);
  const generateUploadUrl = useMutation(api.mutations.storage.generateUploadUrl);
  const addPhoto = useMutation(api.mutations.forms.addPhoto);

  const [showNoteFor, setShowNoteFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  if (!user || job === undefined || form === undefined || formItems === undefined) {
    return <PageLoader />;
  }

  if (!job || !form) {
    return <div className="text-center py-12 text-gray-500">Form not found</div>;
  }

  const totalItems = formItems.length;
  const completedItems = formItems.filter((i) => i.completed).length;
  const allComplete = completedItems === totalItems;
  const photoCount = (form as any).photoStorageIds?.length ?? 0;

  const handleToggleItem = async (itemId: Id<"formItems">, completed: boolean) => {
    await updateItem({ itemId, completed: !completed, userId: user!._id });
  };

  const handleSaveNote = async (itemId: Id<"formItems">) => {
    await updateItem({ itemId, note: noteText || undefined, userId: user!._id });
    setShowNoteFor(null);
    setNoteText("");
  };

  const handlePhotoUpload = async (file: File) => {
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

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await submitForm({ formId: form._id, userId: user!._id });
      setLocation(`/jobs/${job._id}`);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto pb-8">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setLocation(`/jobs/${job._id}`)} className="p-2 hover:bg-gray-100 rounded-lg">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold">Maintenance Checklist</h1>
      </div>

      {/* Progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="font-medium text-gray-700">Progress</span>
          <span className="text-gray-500">{completedItems}/{totalItems}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-primary-500 h-2 rounded-full transition-all"
            style={{ width: `${totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0}%` }}
          />
        </div>
      </div>

      {/* Checklist */}
      <div className="space-y-2 mb-6">
        {formItems.map((item) => (
          <div key={item._id} className="card py-3 px-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleToggleItem(item._id, item.completed)}
                className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                  item.completed
                    ? "bg-primary-500 border-primary-500 text-white"
                    : "border-gray-300"
                }`}
              >
                {item.completed && <Check className="w-4 h-4" />}
              </button>
              <span className={`flex-1 text-sm ${item.completed ? "text-gray-700" : "text-gray-500"}`}>
                {item.itemName}
              </span>
              <button
                onClick={() => { setShowNoteFor(item._id); setNoteText(item.note ?? ""); }}
                className={`p-1.5 rounded ${item.note ? "text-blue-500" : "text-gray-300 hover:text-gray-500"}`}
              >
                <MessageSquare className="w-4 h-4" />
              </button>
            </div>
            {item.note && (
              <p className="text-xs text-gray-500 mt-1 ml-9">{item.note}</p>
            )}
          </div>
        ))}
      </div>

      {/* Photos */}
      <div className="card mb-6">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
          <ImagePlus className="w-5 h-5 text-gray-400" /> Attach Photos (Optional)
        </h3>
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
              if (file) handlePhotoUpload(file);
            }}
          />
        </label>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={submitting || !allComplete}
        className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-lg"
      >
        {submitting ? <LoadingSpinner size="sm" /> : <Send className="w-5 h-5" />}
        Submit for Review
      </button>
      {!allComplete && (
        <p className="text-xs text-gray-500 text-center mt-2">Complete all checklist items to submit.</p>
      )}

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
    </div>
  );
}
