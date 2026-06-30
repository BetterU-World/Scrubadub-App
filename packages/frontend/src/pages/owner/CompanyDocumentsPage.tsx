import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CheckCircle, FileSignature, RotateCcw } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { TemplateEditor } from "@/components/documents/TemplateEditor";
import { useAuth } from "@/hooks/useAuth";

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
  const { user } = useAuth();
  const templates = useQuery(
    (api as any).queries.documentTemplates.listByType,
    user?._id ? { userId: user._id, type: "service_agreement" } : "skip"
  ) as TemplateRecord[] | undefined;
  const createTemplate = useMutation((api as any).mutations.documentTemplates.create);
  const updateTemplate = useMutation((api as any).mutations.documentTemplates.update);
  const setDefault = useMutation((api as any).mutations.documentTemplates.setDefault);
  const restoreScrubDefault = useMutation(
    (api as any).mutations.documentTemplates.restoreScrubDefault
  );

  const defaultTemplate = useMemo(
    () => templates?.find((template) => template.isDefault) ?? templates?.[0],
    [templates]
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedTemplate =
    templates?.find((template) => template._id === selectedId) ?? defaultTemplate ?? null;
  const [name, setName] = useState("SCRUB Service Agreement");
  const [body, setBody] = useState(SCRUB_SERVICE_AGREEMENT_TEMPLATE);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!selectedTemplate) return;
    setSelectedId(selectedTemplate._id);
    setName(selectedTemplate.name ?? "Service Agreement Template");
    setBody(selectedTemplate.body ?? "");
  }, [selectedTemplate?._id]);

  if (!user || templates === undefined) return <PageLoader />;

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
          templateId: selectedTemplate._id,
          name,
          body,
          isDefault: selectedTemplate.isDefault ?? templates.length === 1,
          source: "scrub_editor",
        });
      } else {
        const templateId = await createTemplate({
          userId: user._id,
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

  const makeDefault = async (templateId: string) => {
    setError("");
    try {
      await setDefault({ userId: user._id, templateId });
      showToast("Default template updated");
    } catch (err: any) {
      setError(err.message || "Failed to set default template");
    }
  };

  return (
    <div>
      <PageHeader
        title="Documents"
        description="Manage reusable SCRUB document templates for your company."
      />

      <div className="max-w-6xl space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="card space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary-50 p-2 text-primary-600">
                <FileSignature className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Service Agreement</h2>
                <p className="text-sm text-gray-500">
                  Active template mode: SCRUB editor
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={restoreDefault}
              disabled={saving}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <RotateCcw className="h-4 w-4" />
              Restore SCRUB default
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {(templates.length ? templates : []).map((template) => (
              <button
                key={template._id}
                type="button"
                onClick={() => setSelectedId(template._id)}
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
                      {template.source === "scrub_default" ? "SCRUB default" : "SCRUB editor"}
                    </p>
                  </div>
                  {template.isDefault && <CheckCircle className="h-4 w-4 text-green-600" />}
                </div>
                {!template.isDefault && (
                  <p className="mt-3 text-xs font-medium text-primary-700">Select to edit</p>
                )}
              </button>
            ))}
            {templates.length === 0 && (
              <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600 md:col-span-3">
                No service agreement template yet. Save the editor below or restore the SCRUB
                default to create one.
              </div>
            )}
          </div>
        </section>

        {selectedTemplate && !selectedTemplate.isDefault && (
          <button
            type="button"
            onClick={() => makeDefault(selectedTemplate._id)}
            className="btn-secondary text-sm"
          >
            Set selected template as default
          </button>
        )}

        <section className="card">
          <TemplateEditor
            name={name}
            body={body}
            saving={saving}
            onNameChange={setName}
            onBodyChange={setBody}
            onSave={save}
          />
        </section>
      </div>

      {toast && (
        <div className="fixed right-4 top-4 z-50 rounded-lg bg-green-600 px-4 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
