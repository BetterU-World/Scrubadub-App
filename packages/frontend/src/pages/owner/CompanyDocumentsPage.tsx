import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link } from "wouter";
import {
  ArrowRight,
  FileSignature,
  FileText,
  RotateCcw,
  Users,
} from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { TemplateEditor } from "@/components/documents/TemplateEditor";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";

const SCRUB_SERVICE_AGREEMENT_TEMPLATE = `# Service Agreement

This Service Agreement is between {{company_name}} and {{client_name}} for cleaning services at {{property_address}}.

## Services Included
{{services_included}}

## Schedule and Pricing
Service frequency: {{service_frequency}}
Contract price: {{contract_price}}
Billing schedule: {{billing_schedule}}
Start date: {{start_date}}

## Special Instructions
{{special_instructions}}

## Exceptions
{{exceptions}}

The parties agree that this draft reflects the accepted proposal details and may be updated by the service provider before final signature.`;

type TemplateRecord = {
  _id: string;
  name: string;
  body: string;
  isDefault?: boolean;
  source?: string;
  updatedAt: number;
};

export function CompanyDocumentsPage() {
  const { user, sessionToken } = useAuth();
  const { t } = useTranslation();
  const templates = useQuery(
    (api as any).queries.documentTemplates.listByType,
    user?._id ? { userId: user._id, sessionToken, type: "service_agreement" } : "skip",
  ) as TemplateRecord[] | undefined;
  const workerDocuments = useQuery(
    (api as any).queries.companyOnboardingDocuments.listForOwner,
    user?._id && sessionToken ? { userId: user._id, sessionToken } : "skip",
  ) as any[] | undefined;
  const createTemplate = useMutation(
    (api as any).mutations.documentTemplates.create,
  );
  const updateTemplate = useMutation(
    (api as any).mutations.documentTemplates.update,
  );
  const setDefault = useMutation(
    (api as any).mutations.documentTemplates.setDefault,
  );
  const restoreScrubDefault = useMutation(
    (api as any).mutations.documentTemplates.restoreScrubDefault,
  );

  const defaultTemplate = useMemo(
    () => templates?.find((template) => template.isDefault) ?? templates?.[0],
    [templates],
  );
  const configuredDefaultTemplate = templates?.find(
    (template) => template.isDefault,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedTemplate =
    templates?.find((template) => template._id === selectedId) ??
    defaultTemplate ??
    null;
  const [name, setName] = useState("SCRUB Service Agreement");
  const [body, setBody] = useState(SCRUB_SERVICE_AGREEMENT_TEMPLATE);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<
    { type: "select"; templateId: string } | { type: "restore" } | null
  >(null);

  const dirty =
    !selectedTemplate ||
    name !== selectedTemplate.name ||
    body !== selectedTemplate.body;

  useEffect(() => {
    if (!selectedTemplate) return;
    setSelectedId(selectedTemplate._id);
    setName(selectedTemplate.name ?? "Service Agreement Template");
    setBody(selectedTemplate.body ?? "");
  }, [selectedTemplate?._id]);

  if (!user || templates === undefined || workerDocuments === undefined)
    return <PageLoader />;

  const uploadedWorkerDocuments = workerDocuments.filter(
    (document) => document.storageId,
  ).length;
  const remainingWorkerDocumentSlots = workerDocuments.filter(
    (document) => document.isStandard && !document.storageId,
  ).length;

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      if (selectedTemplate) {
        await updateTemplate({
          userId: user._id,
          sessionToken,
          templateId: selectedTemplate._id,
          name,
          body,
          isDefault: selectedTemplate.isDefault ?? templates.length === 1,
          source: "scrub_editor",
        });
      } else {
        const templateId = await createTemplate({
          userId: user._id,
          sessionToken,
          type: "service_agreement",
          name,
          body,
          isDefault: true,
          source: "scrub_editor",
        });
        setSelectedId(templateId);
      }
      showToast("Template saved");
    } catch (err: any) {
      setError(err.message || "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const restoreDefault = async () => {
    setSaving(true);
    setError("");
    try {
      const templateId = await restoreScrubDefault({
        userId: user._id,
        sessionToken,
        type: "service_agreement",
      });
      setSelectedId(templateId);
      showToast("SCRUB default restored");
    } catch (err: any) {
      setError(err.message || "Failed to restore SCRUB default");
    } finally {
      setSaving(false);
    }
  };

  const requestTemplateSelection = (templateId: string) => {
    if (templateId === selectedTemplate?._id) return;
    if (dirty) {
      setPendingAction({ type: "select", templateId });
      return;
    }
    setSelectedId(templateId);
  };

  const requestRestoreDefault = () => {
    setPendingAction({ type: "restore" });
  };

  const confirmPendingAction = () => {
    const action = pendingAction;
    setPendingAction(null);
    if (action?.type === "select") {
      setSelectedId(action.templateId);
    } else if (action?.type === "restore") {
      void restoreDefault();
    }
  };

  const makeDefault = async (templateId: string) => {
    setError("");
    try {
      await setDefault({ userId: user._id, sessionToken, templateId });
      showToast("Default template updated");
    } catch (err: any) {
      setError(err.message || "Failed to set default template");
    }
  };

  return (
    <div>
      <PageHeader
        title={t("settings.documentsHub")}
        description={t("guidance.owner.documents")}
        back={{ href: "/owner/settings", label: t("navigation.backToSettings") }}
      />

      <div className="max-w-6xl space-y-6">
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        <section
          className="space-y-4"
          aria-labelledby="documents-overview-heading"
        >
          <div>
            <h2
              id="documents-overview-heading"
              className="text-lg font-semibold text-gray-900"
            >
              Documents Hub
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Client templates generate documents for clients. Worker Documents
              are company PDFs used during onboarding and compliance.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Client Templates", templates.length.toString()],
              [
                "Default Client Template",
                configuredDefaultTemplate?.name ?? "Not set",
              ],
              ["Worker PDFs Uploaded", uploadedWorkerDocuments.toString()],
              [
                "Worker Document Slots Remaining",
                remainingWorkerDocumentSlots.toString(),
              ],
            ].map(([label, value]) => (
              <div key={label} className="card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  {label}
                </p>
                <p
                  className="mt-1 truncate text-lg font-semibold text-gray-900"
                  title={value}
                >
                  {value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="card flex items-start gap-3">
              <div className="rounded-lg bg-primary-50 p-2 text-primary-600">
                <FileText className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">
                  Client Document Templates
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Used to generate documents sent to clients. Currently includes
                  Service Agreement templates.
                </p>
              </div>
            </div>
            <Link
              href="/owner/settings/onboarding"
              className="card flex items-start gap-3 transition-colors hover:bg-gray-50"
            >
              <div className="rounded-lg bg-primary-50 p-2 text-primary-600">
                <Users className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-gray-900">
                    Worker Documents
                  </h3>
                  <ArrowRight
                    className="h-4 w-4 text-gray-400"
                    aria-hidden="true"
                  />
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  Company-uploaded PDFs used during worker onboarding and
                  compliance.
                </p>
              </div>
            </Link>
          </div>
        </section>

        <section
          className="card space-y-4"
          aria-labelledby="client-templates-heading"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary-50 p-2 text-primary-600">
                <FileSignature className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2
                  id="client-templates-heading"
                  className="text-base font-semibold text-gray-900"
                >
                  Client Document Templates
                </h2>
                <p className="text-sm text-gray-500">
                  Service Agreement templates used to create agreements for
                  clients.
                </p>
              </div>
            </div>
          </div>

          <h3 className="text-sm font-semibold text-gray-900">Templates</h3>

          <div className="grid gap-3 md:grid-cols-3">
            {(templates.length ? templates : []).map((template) => (
              <button
                key={template._id}
                type="button"
                onClick={() => requestTemplateSelection(template._id)}
                aria-pressed={selectedTemplate?._id === template._id}
                className={`rounded-md border p-3 text-left transition-colors ${
                  selectedTemplate?._id === template._id
                    ? "border-primary-300 bg-primary-50"
                    : "border-gray-200 bg-white hover:bg-gray-50"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-gray-900">{template.name}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {template.source === "scrub_default"
                        ? "SCRUB-provided"
                        : "Company customized"}
                    </p>
                  </div>
                  {template.isDefault && (
                    <span className="badge bg-green-100 text-green-700">
                      Default for new agreements
                    </span>
                  )}
                </div>
                {!template.isDefault && (
                  <p className="mt-3 text-xs font-medium text-primary-700">
                    Select to edit
                  </p>
                )}
              </button>
            ))}
            {templates.length === 0 && (
              <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600 md:col-span-3">
                No client Service Agreement template is configured. Save the
                editor below or restore the SCRUB-provided template. Once
                created, the default template is used for new agreements
                generated from accepted proposals.
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-gray-500">
              Need a clean starting point? Restore a fresh SCRUB-provided
              template without removing existing saved templates.
            </p>
            <button
              type="button"
              onClick={requestRestoreDefault}
              disabled={saving}
              className="btn-secondary flex shrink-0 items-center justify-center gap-2 text-sm"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Restore SCRUB Default
            </button>
          </div>
        </section>

        <section className="card">
          <TemplateEditor
            name={name}
            body={body}
            saving={saving}
            dirty={dirty}
            templateSource={selectedTemplate?.source}
            isDefault={selectedTemplate?.isDefault}
            onNameChange={setName}
            onBodyChange={setBody}
            onSave={save}
            defaultAction={
              selectedTemplate && !selectedTemplate.isDefault ? (
                <button
                  type="button"
                  onClick={() => makeDefault(selectedTemplate._id)}
                  disabled={saving}
                  className="btn-secondary text-sm"
                >
                  Set as Default
                </button>
              ) : undefined
            }
          />
        </section>
      </div>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 top-4 z-50 rounded-lg bg-green-600 px-4 py-3 text-sm font-medium text-white shadow-lg"
        >
          {toast}
        </div>
      )}

      <ConfirmDialog
        open={pendingAction !== null}
        onOpenChange={(open) => !open && setPendingAction(null)}
        title={
          pendingAction?.type === "restore"
            ? "Restore SCRUB Default?"
            : "Discard unsaved changes?"
        }
        description={
          pendingAction?.type === "restore"
            ? `A fresh SCRUB-provided template will be restored and become the default. Existing saved templates will remain.${dirty ? " Your unsaved local changes will be discarded." : ""}`
            : "Switching templates will discard your unsaved local changes. You can stay here and save them first."
        }
        confirmLabel={
          pendingAction?.type === "restore"
            ? "Restore Default"
            : "Discard and Switch"
        }
        onConfirm={confirmPendingAction}
        loading={saving}
      />
    </div>
  );
}
