import { useState, FormEvent } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  Star,
  MapPin,
  Calendar,
  Clock,
  FileText,
  CheckCircle,
} from "lucide-react";

export function ClientPortalPage() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";

  const portal = useQuery(
    api.queries.clientRequests.getClientPortalByToken,
    token ? { token } : "skip"
  );

  // Loading
  if (portal === undefined) {
    return (
      <Shell>
        <div className="flex justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      </Shell>
    );
  }

  // Invalid / disabled
  if (portal === null) {
    return (
      <Shell>
        <div className="card text-center py-12">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Invalid or expired link
          </h2>
          <p className="text-gray-500">
            This portal link is no longer valid. Please contact the company
            directly.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      companyName={portal.companyName}
      companyLogoUrl={portal.companyLogoUrl}
    >
      {/* Request summary */}
      <div className="card space-y-4 mb-6">
        <h2 className="text-lg font-semibold text-gray-900">
          Request Summary
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {portal.propertyAddress && (
            <div className="flex items-center gap-2 text-gray-600">
              <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
              {portal.propertyAddress}
            </div>
          )}
          {portal.propertyName && (
            <div className="flex items-center gap-2 text-gray-600">
              <FileText className="w-4 h-4 text-gray-400 shrink-0" />
              {portal.propertyName}
            </div>
          )}
          {portal.requestedDate && (
            <div className="flex items-center gap-2 text-gray-600">
              <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
              {portal.requestedDate}
            </div>
          )}
          {portal.timeWindow && (
            <div className="flex items-center gap-2 text-gray-600">
              <Clock className="w-4 h-4 text-gray-400 shrink-0" />
              {portal.timeWindow}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-gray-700">Status:</span>
          <StatusLabel status={portal.status} />
        </div>

        {portal.notes && (
          <div className="border-t pt-3">
            <p className="text-sm font-medium text-gray-700 mb-1">
              Original notes
            </p>
            <p className="text-sm text-gray-600">{portal.notes}</p>
          </div>
        )}
      </div>

      {/* Editable client notes */}
      <ClientNotesSection token={token} initialNotes={portal.clientNotes} />

      {/* Feedback form */}
      <FeedbackSection token={token} />
    </Shell>
  );
}

// ── Client notes section ─────────────────────────────────────────

function ClientNotesSection({
  token,
  initialNotes,
}: {
  token: string;
  initialNotes: string;
}) {
  const updateNotes = useMutation(
    api.mutations.clientRequests.updateClientNotesByToken
  );
  const [notes, setNotes] = useState(initialNotes);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await updateNotes({ token, clientNotes: notes });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to save notes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card space-y-3 mb-6">
      <h2 className="text-lg font-semibold text-gray-900">Your Notes</h2>
      <p className="text-sm text-gray-500">
        Add any additional details or updates for the cleaning team.
      </p>
      <textarea
        className="input-field"
        rows={4}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="e.g. Gate code is 1234, please use side entrance..."
        maxLength={2000}
      />
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center gap-2"
        >
          {saving && <LoadingSpinner size="sm" />}
          {saving ? "Saving..." : "Save notes"}
        </button>
        {saved && (
          <span className="text-sm text-green-600 flex items-center gap-1">
            <CheckCircle className="w-4 h-4" /> Saved
          </span>
        )}
      </div>
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}

// ── Feedback form ────────────────────────────────────────────────

function FeedbackSection({ token }: { token: string }) {
  const submitFeedback = useMutation(
    api.mutations.clientRequests.submitClientFeedbackByToken
  );
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  if (submitted) {
    return (
      <div className="card text-center py-8">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <CheckCircle className="h-6 w-6 text-green-600" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Thank you for your feedback!
        </h2>
        <p className="text-sm text-gray-500">
          We appreciate you taking the time to share your experience.
        </p>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (rating < 1) {
      setError("Please select a rating");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await submitFeedback({
        token,
        rating,
        comment: comment.trim() || undefined,
        contactName: contactName.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
      });
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || "Failed to submit feedback");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Leave Feedback</h2>
      <p className="text-sm text-gray-500">
        How was your experience? Your feedback helps us improve.
      </p>

      {/* Star rating */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Rating
        </label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoveredRating(star)}
              onMouseLeave={() => setHoveredRating(0)}
              className="p-1 transition-colors"
            >
              <Star
                className={`w-8 h-8 ${
                  star <= (hoveredRating || rating)
                    ? "fill-yellow-400 text-yellow-400"
                    : "text-gray-300"
                }`}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Comment */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Comment{" "}
          <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <textarea
          className="input-field"
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Tell us about your experience..."
          maxLength={1000}
        />
      </div>

      {/* Optional contact info */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-gray-700">
          Contact info{" "}
          <span className="font-normal text-gray-400">(optional)</span>
        </legend>
        <input
          className="input-field"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          placeholder="Your name"
          maxLength={200}
        />
        <input
          type="email"
          className="input-field"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          placeholder="your@email.com"
          maxLength={200}
        />
      </fieldset>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <div className="pt-1">
        <button
          type="submit"
          disabled={submitting}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {submitting && <LoadingSpinner size="sm" />}
          Submit Feedback
        </button>
      </div>
    </form>
  );
}

// ── Status label ─────────────────────────────────────────────────

function StatusLabel({
  status,
}: {
  status: "new" | "accepted" | "declined" | "converted";
}) {
  const styles: Record<string, string> = {
    new: "bg-blue-100 text-blue-700",
    accepted: "bg-green-100 text-green-700",
    declined: "bg-red-100 text-red-700",
    converted: "bg-purple-100 text-purple-700",
  };
  const labels: Record<string, string> = {
    new: "Pending",
    accepted: "Accepted",
    declined: "Declined",
    converted: "Scheduled",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[status] ?? "bg-gray-100 text-gray-700"}`}
    >
      {labels[status] ?? status}
    </span>
  );
}

// ── Shell (consistent with PublicRequestPage) ────────────────────

function Shell({
  companyName,
  companyLogoUrl,
  children,
}: {
  companyName?: string;
  companyLogoUrl?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          {companyLogoUrl && (
            <img
              src={companyLogoUrl}
              alt=""
              className="h-8 w-8 rounded object-cover"
            />
          )}
          <h1 className="text-lg font-bold text-gray-900">
            Client Portal
            {companyName && (
              <span className="font-normal text-gray-500">
                {" "}
                &mdash; {companyName}
              </span>
            )}
          </h1>
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
