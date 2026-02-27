import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Clock,
  FileText,
  XCircle,
  Briefcase,
  Building2,
  Check,
  Link2,
  Copy,
  Star,
  MessageSquare,
  PhoneOutgoing,
  Archive,
  Save,
  X,
  AlertCircle,
  Sparkles,
} from "lucide-react";

export function RequestDetailPage() {
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();

  const request = useQuery(
    api.queries.clientRequests.getRequestById,
    params.id && user
      ? { id: params.id as Id<"clientRequests">, userId: user._id }
      : "skip"
  );

  const updateStatus = useMutation(
    api.mutations.clientRequests.updateRequestStatus
  );
  const createProperty = useMutation(
    api.mutations.clientRequests.createPropertyFromRequest
  );

  const generatePortalLink = useMutation(
    api.mutations.clientRequests.generateClientPortalLink
  );
  const archiveRequest = useMutation(
    api.mutations.clientRequests.archiveClientRequest
  );
  const updateLeadStage = useMutation(
    api.mutations.clientRequests.updateLeadStage
  );
  const updateLeadNotesMut = useMutation(
    api.mutations.clientRequests.updateLeadNotes
  );
  const updateNextFollowUpMut = useMutation(
    api.mutations.clientRequests.updateNextFollowUp
  );

  const latestFeedback = useQuery(
    api.queries.clientRequests.getLatestFeedbackForRequest,
    params.id && user
      ? {
          userId: user._id,
          clientRequestId: params.id as Id<"clientRequests">,
        }
      : "skip"
  );

  const [showDecline, setShowDecline] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [creatingProperty, setCreatingProperty] = useState(false);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [generatingPortal, setGeneratingPortal] = useState(false);
  const [copiedPortal, setCopiedPortal] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  // Lead pipeline state
  const [leadNotesVal, setLeadNotesVal] = useState("");
  const [leadNotesLoaded, setLeadNotesLoaded] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [followUpVal, setFollowUpVal] = useState("");
  const [savingFollowUp, setSavingFollowUp] = useState(false);

  // Sync lead notes / follow-up from server on first load
  useEffect(() => {
    if (request && !leadNotesLoaded) {
      setLeadNotesVal((request as any).leadNotes ?? "");
      if ((request as any).nextFollowUpAt) {
        const d = new Date((request as any).nextFollowUpAt);
        // Format as datetime-local value
        const pad = (n: number) => String(n).padStart(2, "0");
        setFollowUpVal(
          `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
        );
      }
      setLeadNotesLoaded(true);
    }
  }, [request, leadNotesLoaded]);

  if (request === undefined) return <PageLoader />;
  if (request === null) {
    return (
      <div className="text-center py-12 text-gray-500">Request not found</div>
    );
  }

  const canAct = request.status === "new" || request.status === "accepted" || request.status === "contacted";
  const canMarkContacted = request.status === "new";
  const canArchive = request.status !== "archived";

  const [contactingLoading, setContactingLoading] = useState(false);
  const handleMarkContacted = async () => {
    setContactingLoading(true);
    try {
      await updateStatus({
        requestId: request._id,
        userId: user!._id,
        status: "contacted",
      });
      setToast({ message: "Marked as contacted", type: "success" });
      setTimeout(() => setToast(null), 3000);
    } catch (err: any) {
      setToast({ message: err.message || "Failed to update", type: "error" });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setContactingLoading(false);
    }
  };

  const [archiving, setArchiving] = useState(false);
  const handleArchive = async () => {
    setArchiving(true);
    try {
      await archiveRequest({
        requestId: request._id,
        userId: user!._id,
      });
      setToast({ message: "Request archived", type: "success" });
      setTimeout(() => setToast(null), 3000);
    } catch (err: any) {
      setToast({ message: err.message || "Failed to archive", type: "error" });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setArchiving(false);
    }
  };

  const handleConvert = () => {
    const notesParts: string[] = ["Client Request:"];
    if (request.requesterName) notesParts.push(`Name: ${request.requesterName}`);
    if (request.requesterEmail) notesParts.push(`Email: ${request.requesterEmail}`);
    if (request.timeWindow) notesParts.push(`Time window: ${request.timeWindow}`);
    if (request.notes) notesParts.push(`---\n${request.notes}`);

    const prefill: Record<string, string> = {
      requestId: request._id,
      scheduledDate: request.requestedDate || "",
      address: request.propertySnapshot?.address || "",
      propertyName: request.propertySnapshot?.name || "",
      notes: notesParts.join("\n"),
    };
    if (request.propertyId) {
      prefill.propertyId = request.propertyId;
    }
    sessionStorage.setItem("clientRequestPrefill", JSON.stringify(prefill));
    setLocation("/jobs/new");
  };

  const handleCreateProperty = async () => {
    setCreatingProperty(true);
    try {
      await createProperty({ requestId: request._id, userId: user!._id });
      setToast({ message: "Property created", type: "success" });
      setTimeout(() => setToast(null), 3000);
    } catch (err: any) {
      setToast({ message: err.message || "Failed to create property", type: "error" });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setCreatingProperty(false);
    }
  };

  const handleGeneratePortalLink = async () => {
    setGeneratingPortal(true);
    try {
      const result = await generatePortalLink({
        userId: user!._id,
        clientRequestId: request._id,
      });
      const h = window.location.hostname;
      const base =
        h === "localhost" || h === "127.0.0.1"
          ? `${window.location.protocol}//${window.location.host}`
          : "https://scrubscrubscrub.com";
      setPortalUrl(`${base}/c/${result.token}`);
    } catch (err: any) {
      setToast({
        message: err.message || "Failed to generate portal link",
        type: "error",
      });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setGeneratingPortal(false);
    }
  };

  const handleCopyPortalUrl = () => {
    if (!portalUrl) return;
    navigator.clipboard.writeText(portalUrl).then(() => {
      setCopiedPortal(true);
      setTimeout(() => setCopiedPortal(false), 2000);
    });
  };

  const handleDecline = async () => {
    setDeclining(true);
    try {
      await updateStatus({
        requestId: request._id,
        userId: user!._id,
        status: "declined",
      });
      setShowDecline(false);
      setToast({ message: "Request declined", type: "success" });
      setTimeout(() => setToast(null), 3000);
    } catch (err: any) {
      setToast({ message: err.message || "Failed to decline", type: "error" });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setDeclining(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={request.requesterName}
        action={
          <div className="flex gap-2 flex-wrap">
            {canMarkContacted && (
              <button
                onClick={handleMarkContacted}
                disabled={contactingLoading}
                className="btn-secondary flex items-center gap-2"
              >
                <PhoneOutgoing className="w-4 h-4" /> {contactingLoading ? "Contacting..." : "Mark Contacted"}
              </button>
            )}
            {canAct && (
              <>
                <button
                  onClick={handleConvert}
                  className="btn-primary flex items-center gap-2"
                >
                  <Briefcase className="w-4 h-4" /> Convert to Job
                </button>
                <button
                  onClick={() => setShowDecline(true)}
                  className="btn-danger flex items-center gap-2"
                >
                  <XCircle className="w-4 h-4" /> Decline
                </button>
              </>
            )}
            {canArchive && (
              <button
                onClick={handleArchive}
                disabled={archiving}
                className="btn-secondary flex items-center gap-2 text-gray-500"
              >
                <Archive className="w-4 h-4" /> {archiving ? "Archiving..." : "Archive"}
              </button>
            )}
          </div>
        }
      />

      {/* Info card */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={request.status} />
          <span className="text-xs text-gray-400">
            Submitted {new Date(request.createdAt).toLocaleString()}
          </span>
          {(request as any).contactedAt && (
            <span className="text-xs text-gray-400">
              Contacted {new Date((request as any).contactedAt).toLocaleString()}
            </span>
          )}
          {(request as any).archivedAt && (
            <span className="text-xs text-gray-400">
              Archived {new Date((request as any).archivedAt).toLocaleString()}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 text-gray-600">
            <User className="w-4 h-4 text-gray-400" />
            {request.requesterName}
          </div>
          <div className="flex items-center gap-2 text-gray-600">
            <Mail className="w-4 h-4 text-gray-400" />
            <a
              href={`mailto:${request.requesterEmail}`}
              className="text-primary-600 hover:underline"
            >
              {request.requesterEmail}
            </a>
          </div>
          {request.requesterPhone && (
            <div className="flex items-center gap-2 text-gray-600">
              <Phone className="w-4 h-4 text-gray-400" />
              {request.requesterPhone}
            </div>
          )}
          {request.propertySnapshot?.address && (
            <div className="flex items-center gap-2 text-gray-600">
              <MapPin className="w-4 h-4 text-gray-400" />
              {request.propertySnapshot.address}
            </div>
          )}
          {request.propertySnapshot?.name && (
            <div className="flex items-center gap-2 text-gray-600">
              <FileText className="w-4 h-4 text-gray-400" />
              {request.propertySnapshot.name}
            </div>
          )}
          {request.requestedDate && (
            <div className="flex items-center gap-2 text-gray-600">
              <Calendar className="w-4 h-4 text-gray-400" />
              {request.requestedDate}
            </div>
          )}
          {request.timeWindow && (
            <div className="flex items-center gap-2 text-gray-600">
              <Clock className="w-4 h-4 text-gray-400" />
              {request.timeWindow}
            </div>
          )}
          {(request as any).requestedService && (
            <div className="flex items-center gap-2 text-gray-600">
              <Sparkles className="w-4 h-4 text-gray-400" />
              {(request as any).requestedService}
            </div>
          )}
        </div>

        {request.notes && (
          <div className="border-t pt-3">
            <p className="text-sm font-medium text-gray-700 mb-1">Notes</p>
            <p className="text-sm text-gray-600">{request.notes}</p>
          </div>
        )}

        {/* Property link section */}
        <div className="border-t pt-3">
          {request.propertyId ? (
            <p className="flex items-center gap-2 text-sm text-primary-700">
              <Check className="w-4 h-4" /> Property linked
            </p>
          ) : canAct && request.propertySnapshot?.address ? (
            <button
              onClick={handleCreateProperty}
              disabled={creatingProperty}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <Building2 className="w-4 h-4" />
              {creatingProperty ? "Creating..." : "Create Property"}
            </button>
          ) : null}
        </div>
      </div>

      {/* Lead Pipeline controls */}
      <div className="card mt-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">Lead Pipeline</h3>

        {/* Stage selector */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Lead Stage
          </label>
          <div className="flex gap-1.5 flex-wrap">
            {(["new", "contacted", "quoted", "won", "lost"] as const).map(
              (stage) => {
                const current = (request as any).leadStage ?? "new";
                const isActive = current === stage;
                return (
                  <button
                    key={stage}
                    onClick={async () => {
                      try {
                        await updateLeadStage({
                          userId: user!._id,
                          requestId: request._id,
                          leadStage: stage,
                        });
                        setToast({ message: `Stage → ${stage}`, type: "success" });
                        setTimeout(() => setToast(null), 2000);
                      } catch (err: any) {
                        setToast({ message: err.message || "Failed", type: "error" });
                        setTimeout(() => setToast(null), 3000);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                      isActive
                        ? "bg-primary-600 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {stage}
                  </button>
                );
              }
            )}
          </div>
        </div>

        {/* Lead Notes */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Lead Notes (internal)
          </label>
          <textarea
            className="input-field text-sm"
            rows={3}
            maxLength={4000}
            placeholder="Internal notes about this lead..."
            value={leadNotesVal}
            onChange={(e) => setLeadNotesVal(e.target.value)}
          />
          <div className="flex items-center gap-2 mt-1.5">
            <button
              disabled={savingNotes}
              onClick={async () => {
                setSavingNotes(true);
                try {
                  await updateLeadNotesMut({
                    userId: user!._id,
                    requestId: request._id,
                    leadNotes: leadNotesVal,
                  });
                  setToast({ message: "Notes saved", type: "success" });
                  setTimeout(() => setToast(null), 2000);
                } catch (err: any) {
                  setToast({ message: err.message || "Failed", type: "error" });
                  setTimeout(() => setToast(null), 3000);
                } finally {
                  setSavingNotes(false);
                }
              }}
              className="btn-secondary flex items-center gap-1.5 text-xs py-1 px-2.5"
            >
              <Save className="w-3 h-3" />
              {savingNotes ? "Saving..." : "Save Notes"}
            </button>
            <span className="text-xs text-gray-400">
              {leadNotesVal.length}/4000
            </span>
          </div>
        </div>

        {/* Next Follow-up */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Next Follow-up
          </label>
          <div className="flex items-center gap-2">
            <input
              type="datetime-local"
              className="input-field text-sm flex-1"
              value={followUpVal}
              onChange={(e) => setFollowUpVal(e.target.value)}
            />
            <button
              disabled={savingFollowUp}
              onClick={async () => {
                setSavingFollowUp(true);
                try {
                  const ts = followUpVal
                    ? new Date(followUpVal).getTime()
                    : undefined;
                  await updateNextFollowUpMut({
                    userId: user!._id,
                    requestId: request._id,
                    nextFollowUpAt: ts,
                  });
                  setToast({
                    message: ts ? "Follow-up set" : "Follow-up cleared",
                    type: "success",
                  });
                  setTimeout(() => setToast(null), 2000);
                } catch (err: any) {
                  setToast({ message: err.message || "Failed", type: "error" });
                  setTimeout(() => setToast(null), 3000);
                } finally {
                  setSavingFollowUp(false);
                }
              }}
              className="btn-secondary flex items-center gap-1.5 text-xs py-1 px-2.5"
            >
              <Save className="w-3 h-3" />
              {savingFollowUp ? "..." : "Save"}
            </button>
            {followUpVal && (
              <button
                onClick={async () => {
                  setFollowUpVal("");
                  setSavingFollowUp(true);
                  try {
                    await updateNextFollowUpMut({
                      userId: user!._id,
                      requestId: request._id,
                      nextFollowUpAt: undefined,
                    });
                    setToast({ message: "Follow-up cleared", type: "success" });
                    setTimeout(() => setToast(null), 2000);
                  } catch (err: any) {
                    setToast({ message: err.message || "Failed", type: "error" });
                    setTimeout(() => setToast(null), 3000);
                  } finally {
                    setSavingFollowUp(false);
                  }
                }}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                title="Clear follow-up"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {(request as any).nextFollowUpAt && (request as any).nextFollowUpAt <= Date.now() && (
            <p className="flex items-center gap-1 text-xs text-red-600 mt-1">
              <AlertCircle className="w-3 h-3" /> Overdue
            </p>
          )}
        </div>
      </div>

      {/* Client Feedback link */}
      <div className="card mt-4 space-y-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">
            Client Feedback Link
          </h3>
        </div>
        <p className="text-sm text-gray-500">
          Send this after service to collect feedback. No login required.
        </p>
        {portalUrl ? (
          <div className="space-y-2">
            <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-sm font-mono text-gray-800 break-all select-all">
              {portalUrl}
            </div>
            <button
              onClick={handleCopyPortalUrl}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <Copy className="w-4 h-4" />
              {copiedPortal ? "Copied!" : "Copy link"}
            </button>
          </div>
        ) : (
          <button
            onClick={handleGeneratePortalLink}
            disabled={generatingPortal}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <MessageSquare className="w-4 h-4" />
            {generatingPortal ? "Generating..." : "Generate Feedback Link"}
          </button>
        )}
      </div>

      {/* Client notes (if any) */}
      {request.clientNotes && (
        <div className="card mt-4 space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">
            Client Notes
          </h3>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">
            {request.clientNotes}
          </p>
          {request.updatedByClientAt && (
            <p className="text-xs text-gray-400">
              Updated by client{" "}
              {new Date(request.updatedByClientAt).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* Latest feedback */}
      {latestFeedback && (
        <div className="card mt-4 space-y-2">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-yellow-500" />
            <h3 className="text-sm font-semibold text-gray-900">
              Client Feedback
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`w-4 h-4 ${
                    s <= latestFeedback.rating
                      ? "fill-yellow-400 text-yellow-400"
                      : "text-gray-300"
                  }`}
                />
              ))}
            </div>
            <span className="text-xs text-gray-400">
              {new Date(latestFeedback.createdAt).toLocaleDateString()}
            </span>
          </div>
          {latestFeedback.comment && (
            <p className="text-sm text-gray-600">{latestFeedback.comment}</p>
          )}
          {(latestFeedback.contactName || latestFeedback.contactEmail) && (
            <p className="text-xs text-gray-400">
              {[latestFeedback.contactName, latestFeedback.contactEmail]
                .filter(Boolean)
                .join(" — ")}
            </p>
          )}
        </div>
      )}

      {/* Back link */}
      <button
        onClick={() => setLocation("/requests")}
        className="mt-4 text-sm text-primary-600 hover:underline"
      >
        &larr; Back to requests
      </button>

      {/* Decline dialog */}
      <ConfirmDialog
        open={showDecline}
        onOpenChange={setShowDecline}
        title="Decline request"
        description={`Decline the request from ${request.requesterName}? This cannot be undone.`}
        confirmLabel="Decline"
        confirmVariant="danger"
        onConfirm={handleDecline}
        loading={declining}
      />

      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
            toast.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
