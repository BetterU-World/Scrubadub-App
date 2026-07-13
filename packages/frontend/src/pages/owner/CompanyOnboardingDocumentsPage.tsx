import { useRef, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { getStaffSessionToken, useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader, LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  ToggleLeft,
  Upload,
  X,
} from "lucide-react";

const ROLE_OPTIONS = [
  { value: "both", label: "All workers" },
  { value: "cleaner", label: "Cleaners" },
  { value: "maintenance", label: "Maintenance workers" },
] as const;

const STATUS_OPTIONS = [
  { value: "active", label: "Visible to selected workers" },
  { value: "inactive", label: "Hidden from workers" },
] as const;

function deliverySummary(document: any) {
  if (document.status !== "active") return "Hidden from workers";
  if (!document.storageId) return "Not available until a PDF is uploaded";
  if (document.roleVisibility === "cleaner") return "Available to cleaners";
  if (document.roleVisibility === "maintenance") return "Available to maintenance workers";
  return "Available to all workers";
}

export function CompanyOnboardingDocumentsPage() {
  const { user, sessionToken } = useAuth();
  const documents = useQuery(
    (api as any).queries.companyOnboardingDocuments.listForOwner,
    user?._id && sessionToken ? { userId: user._id, sessionToken } : "skip"
  );
  const generateUploadUrl = useMutation(api.mutations.storage.generateUploadUrl);
  const validateUpload = useMutation(api.mutations.storage.validateUpload);
  const attachPdf = useMutation((api as any).mutations.companyOnboardingDocuments.attachPdf);
  const upsertMetadata = useMutation((api as any).mutations.companyOnboardingDocuments.upsertMetadata);
  const removePdf = useMutation((api as any).mutations.companyOnboardingDocuments.removePdf);

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!user || documents === undefined) return <PageLoader />;

  const saveMetadata = async (document: any, updates: Record<string, unknown>) => {
    setBusyKey(document.documentKey);
    setError(null);
    try {
      await upsertMetadata({
        userId: user._id,
        sessionToken: getStaffSessionToken(),
        documentKey: document.documentKey,
        title: document.title,
        description: document.description,
        required: document.required,
        roleVisibility: document.roleVisibility,
        status: document.status,
        ...updates,
      });
    } catch (err: any) {
      setError(err.message ?? "Could not save onboarding document");
    } finally {
      setBusyKey(null);
    }
  };

  const uploadPdf = async (document: any, file?: File) => {
    if (!file) return;
    setBusyKey(document.documentKey);
    setError(null);
    try {
      await validateUpload({
        userId: user._id,
        sessionToken: getStaffSessionToken(),
        mimeType: file.type,
        size: file.size,
        fileName: file.name,
      });
      if (file.type !== "application/pdf") {
        throw new Error("Only PDF files are supported for onboarding documents");
      }
      const uploadUrl = await generateUploadUrl({ userId: user._id, sessionToken: getStaffSessionToken() });
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await result.json();
      await attachPdf({
        userId: user._id,
        sessionToken: getStaffSessionToken(),
        documentKey: document.documentKey,
        storageId,
        title: document.title,
        description: document.description,
        required: document.required,
        roleVisibility: document.roleVisibility,
        status: document.status,
      });
    } catch (err: any) {
      setError(err.message ?? "Could not upload PDF");
    } finally {
      setBusyKey(null);
      const input = fileInputRefs.current[document.documentKey];
      if (input) input.value = "";
    }
  };

  const handleRemovePdf = async (document: any) => {
    setBusyKey(document.documentKey);
    setError(null);
    try {
      await removePdf({
        userId: user._id,
        sessionToken: getStaffSessionToken(),
        documentKey: document.documentKey,
      });
    } catch (err: any) {
      setError(err.message ?? "Could not remove PDF");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Worker Documents"
        description="Upload and manage the PDFs workers use during onboarding and compliance. Each card shows who can access the document and whether owner action is needed."
        action={
          <Link href="/owner/settings" className="btn-secondary flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Settings
          </Link>
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-3 max-w-4xl">
        {documents.map((document: any) => {
          const busy = busyKey === document.documentKey;
          const hasPdf = Boolean(document.storageId);
          const needsUpload = !hasPdf && document.required && document.status === "active";
          return (
            <section key={document.documentKey} className="card">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-gray-100 p-2 text-gray-600">
                      <FileText className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-gray-900">{document.title}</h2>
                      <p className="text-sm text-gray-500">{document.description}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className={`badge ${hasPdf ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                      {hasPdf ? "Uploaded" : "Not Uploaded"}
                    </span>
                    <span className={`badge ${document.required ? "bg-primary-100 text-primary-700" : "bg-gray-100 text-gray-700"}`}>
                      {document.required ? "Required" : "Optional"}
                    </span>
                    <span className={`badge ${document.status === "active" && hasPdf ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}`}>
                      {deliverySummary(document)}
                    </span>
                  </div>

                  {needsUpload && (
                    <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                      Action needed: upload this required document so assigned workers can review it.
                    </p>
                  )}

                  {document.updatedAt && (
                    <p className="mt-2 text-xs text-gray-400">
                      {hasPdf ? "Updated" : "Settings updated"}: {new Date(document.updatedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:w-[360px]">
                  <label className="text-xs font-medium uppercase text-gray-400 sm:col-span-2">
                    Worker Audience
                    <select
                      className="input-field mt-1 text-sm"
                      value={document.roleVisibility}
                      disabled={busy}
                      onChange={(event) => saveMetadata(document, { roleVisibility: event.target.value })}
                    >
                      {ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs font-medium uppercase text-gray-400">
                    Visibility
                    <select
                      className="input-field mt-1 text-sm"
                      value={document.status}
                      disabled={busy}
                      onChange={(event) => saveMetadata(document, { status: event.target.value })}
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    className="btn-secondary flex items-center justify-center gap-2 self-end text-sm"
                    disabled={busy}
                    onClick={() => saveMetadata(document, { required: !document.required })}
                  >
                    <ToggleLeft className="w-4 h-4" aria-hidden="true" />
                    {document.required ? "Make Optional" : "Make Required"}
                  </button>

                  <input
                    ref={(element) => { fileInputRefs.current[document.documentKey] = element; }}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    aria-label={`Upload PDF for ${document.title}`}
                    onChange={(event) => uploadPdf(document, event.target.files?.[0])}
                  />

                  <button
                    type="button"
                    className="btn-primary flex items-center justify-center gap-2 text-sm"
                    disabled={busy}
                    onClick={() => fileInputRefs.current[document.documentKey]?.click()}
                  >
                    {busy ? <LoadingSpinner size="sm" /> : <Upload className="w-4 h-4" aria-hidden="true" />}
                    {hasPdf ? "Replace PDF" : "Upload PDF"}
                  </button>

                  {hasPdf && document.url && (
                    <a
                      href={document.url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary flex items-center justify-center gap-2 text-sm"
                    >
                      <ExternalLink className="w-4 h-4" aria-hidden="true" />
                      Open PDF
                    </a>
                  )}

                  {hasPdf && (
                    <button
                      type="button"
                      className="flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm text-gray-500 hover:bg-red-50 hover:text-red-600"
                      disabled={busy}
                      onClick={() => handleRemovePdf(document)}
                    >
                      <X className="w-4 h-4" aria-hidden="true" />
                      Remove PDF
                    </button>
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
