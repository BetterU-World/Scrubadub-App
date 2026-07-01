import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link } from "wouter";
import {
  ArrowRight,
  CheckCircle,
  FileSignature,
  FileText,
  Lock,
  RotateCcw,
  ShieldCheck,
  Upload,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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

type DocumentCard = {
  title: string;
  description: string;
  status: "editable" | "coming_soon";
  icon: LucideIcon;
};

const DOCUMENT_CARDS: DocumentCard[] = [
  {
    title: "Service Agreement",
    description: "Reusable agreement created after a proposal is accepted.",
    status: "editable",
    icon: FileSignature,
  },
  {
    title: "Proposal Template",
    description: "Reusable proposal layouts and language.",
    status: "coming_soon",
    icon: FileText,
  },
  {
    title: "Employee Agreement",
    description: "Worker agreements and onboarding language.",
    status: "coming_soon",
    icon: Users,
  },
  {
    title: "NDA",
    description: "Confidentiality documents for workers and partners.",
    status: "coming_soon",
    icon: Lock,
  },
  {
    title: "Safety Policy",
    description: "Standard safety expectations and acknowledgements.",
    status: "coming_soon",
    icon: ShieldCheck,
  },
  {
    title: "Additional Documents",
    description: "Company PDFs and other reusable documents.",
    status: "coming_soon",
    icon: Upload,
  },
];

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
        description="Manage the company documents SCRUB can reuse as your business grows."
      />

      <div className="max-w-6xl space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {DOCUMENT_CARDS.map((document) => {
            const Icon = document.icon;
            const editable = document.status === "editable";
            return (
              <div
                key={document.title}
                className={`rounded-lg border p-4 ${
                  editable
                    ? "border-primary-200 bg-white shadow-sm"
                    : "border-gray-200 bg-gray-50 text-gray-500"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`rounded-lg p-2 ${
                      editable ? "bg-primary-50 text-primary-600" : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-gray-900">{document.title}</h2>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          editable
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-200 text-gray-600"
                        }`}
                      >
                        {editable ? "Editable" : "Coming soon"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">{document.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        <section className="card space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase text-primary-700">Service Agreement</p>
            <h2 className="mt-1 text-xl font-semibold text-gray-900">
              Edit your reusable agreement template
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
              This template is used when SCRUB creates a service agreement from an accepted
              proposal. Auto-fill fields like Client Name, Price, and Property Address are filled
              during agreement generation. Editing this template only affects future agreements,
              not agreements already created, sent, or signed.
            </p>
          </div>

          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-blue-950">How this works</h3>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-blue-900">
                  <li>Edit your reusable template.</li>
                  <li>Use auto-fill fields for client, property, proposal, and agreement details.</li>
                  <li>Save the template.</li>
                  <li>When a proposal is accepted, create a Service Agreement from the request or proposal page.</li>
                  <li>SCRUB fills in the saved template and stores a snapshot for that client.</li>
                </ol>
              </div>
              <Link
                href="/requests"
                className="btn-secondary inline-flex shrink-0 items-center justify-center gap-2 text-sm"
              >
                Go to Requests
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900">Template mode</h3>
            <div className="mt-2 grid gap-3 md:grid-cols-3">
              <button
                type="button"
                onClick={restoreDefault}
                disabled={saving}
                className="rounded-md border border-gray-200 bg-white p-3 text-left hover:bg-gray-50 disabled:opacity-60"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                  <RotateCcw className="h-4 w-4 text-gray-400" />
                  Use SCRUB Template
                </div>
                <p className="mt-1 text-xs text-gray-500">Restore a fresh SCRUB default copy.</p>
              </button>
              <div className="rounded-md border border-primary-300 bg-primary-50 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-primary-900">
                  <CheckCircle className="h-4 w-4 text-primary-600" />
                  Create/Edit in SCRUB Editor
                </div>
                <p className="mt-1 text-xs text-primary-700">Active for V1.</p>
              </div>
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3 opacity-75">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
                  <Upload className="h-4 w-4" />
                  Upload PDF
                </div>
                <p className="mt-1 text-xs text-gray-500">Coming soon.</p>
              </div>
            </div>
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

          {selectedTemplate && !selectedTemplate.isDefault && (
            <button
              type="button"
              onClick={() => makeDefault(selectedTemplate._id)}
              className="btn-secondary text-sm"
            >
              Set selected template as default
            </button>
          )}
        </section>

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
