import { useState } from "react";
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

  if (request === undefined) return <PageLoader />;
  if (request === null) {
    return (
      <div className="text-center py-12 text-gray-500">Request not found</div>
    );
  }

  const canAct = request.status === "new" || request.status === "accepted";

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
          canAct ? (
            <div className="flex gap-2">
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
            </div>
          ) : undefined
        }
      />

      {/* Info card */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={request.status} />
          <span className="text-xs text-gray-400">
            Submitted {new Date(request.createdAt).toLocaleString()}
          </span>
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

      {/* Client Portal link */}
      <div className="card mt-4 space-y-3">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">
            Client Portal Link
          </h3>
        </div>
        <p className="text-sm text-gray-500">
          Share a link so the client can view their request, add notes, and
          leave feedback — no login required.
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
            <Link2 className="w-4 h-4" />
            {generatingPortal ? "Generating..." : "Generate Portal Link"}
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
