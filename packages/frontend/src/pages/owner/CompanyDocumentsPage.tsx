import { useSimpleFeedbackState } from "@/components/ui/FeedbackProvider";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  FileSignature,
  RotateCcw,
} from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { TemplateEditor } from "@/components/documents/TemplateEditor";
import { ClientDocumentsSection } from "@/components/documents/ClientDocumentsSection";
import { TeamDocumentsSection } from "@/components/documents/TeamDocumentsSection";
import { getActiveDocumentSection, getDocumentSections } from "@/components/documents/documentSections";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";

const SCRUB_SERVICE_AGREEMENT_TEMPLATE = `# Service Agreement

This Service Agreement is between {{company_name}} and {{client_name}} for cleaning services at {{property_address}}.

## Services Included
{{services_included}}

## Committed Add-Ons
{{add_on_line_items}}

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
  const canDocuments = user?.role === "owner" || user?.canManageDocuments === true;
  const sections = getDocumentSections(user);
  const [selectedSection, setSelectedSection] = useState(() =>
    typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("section") ?? "");
  const activeSection = getActiveDocumentSection(sections, selectedSection);
  const changeSection = (section: string) => {
    setSelectedSection(section);
    const url = new URL(window.location.href);
    url.searchParams.set("section", section);
    window.history.replaceState(window.history.state, "", url);
  };
  const queriedTemplates = useQuery(
    (api as any).queries.documentTemplates.listByType,
    canDocuments && user?._id && sessionToken ? { userId: user._id, sessionToken, type: "service_agreement" } : "skip",
  ) as TemplateRecord[] | undefined;
  const templates = queriedTemplates ?? [];
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

  const defaultTemplate = useMemo(() => templates.find((template) => template.isDefault) ?? templates[0], [queriedTemplates]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedTemplate =
    templates.find((template) => template._id === selectedId) ??
    defaultTemplate ??
    null;
  const [name, setName] = useState("SCRUB Service Agreement");
  const [body, setBody] = useState(SCRUB_SERVICE_AGREEMENT_TEMPLATE);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useSimpleFeedbackState();
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<
    { type: "select"; templateId: string } | { type: "restore" } | { type: "section"; section: string } | null
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

  if (!user || !activeSection || (activeSection === "templates" && queriedTemplates === undefined))
    return <PageLoader />;

  const showToast = (message: string) => {
    setToast(message);
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

  const requestSectionChange = (section: string) => {
    if (section === activeSection) return;
    if (activeSection === "templates" && dirty) {
      setPendingAction({ type: "section", section });
      return;
    }
    changeSection(section);
  };

  const confirmPendingAction = () => {
    const action = pendingAction;
    setPendingAction(null);
    if (action?.type === "select") {
      setSelectedId(action.templateId);
    } else if (action?.type === "restore") {
      void restoreDefault();
    } else if (action?.type === "section") {
      if (selectedTemplate) {
        setName(selectedTemplate.name);
        setBody(selectedTemplate.body);
      }
      changeSection(action.section);
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
        <nav aria-label={t("documentsHub.sections")} className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
          {sections.map((section) => (
            <button
              key={section}
              type="button"
              onClick={() => requestSectionChange(section)}
              aria-current={activeSection === section ? "page" : undefined}
              className={`rounded-md px-4 py-2 text-sm font-medium ${activeSection === section ? "bg-primary-600 text-white" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}
            >
              {t(`documentsHub.${section}`)}
            </button>
          ))}
        </nav>

        {activeSection === "client" && <ClientDocumentsSection />}
        {activeSection === "team" && <TeamDocumentsSection />}
        {activeSection === "templates" && <>
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

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
                  {t("documentsHub.serviceAgreementTemplates")}
                </h2>
                <p className="text-sm text-gray-500">
                  {t("documentsHub.templateIntro")}
                </p>
              </div>
            </div>
          </div>

          <h3 className="text-sm font-semibold text-gray-900">{t("documentsHub.templates")}</h3>

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
                        ? t("documentsHub.templateOriginScrub")
                        : t("documentsHub.templateOriginCompany")}
                    </p>
                  </div>
                  {template.isDefault && (
                    <span className="badge bg-green-100 text-green-700">
                      {t("documentsHub.defaultForNew")}
                    </span>
                  )}
                </div>
                {!template.isDefault && (
                  <p className="mt-3 text-xs font-medium text-primary-700">
                    {t("documentsHub.selectToEdit")}
                  </p>
                )}
              </button>
            ))}
            {templates.length === 0 && (
              <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600 md:col-span-3">
                {t("documentsHub.templateEmpty")}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-gray-500">
              {t("documentsHub.restoreHint")}
            </p>
            <button
              type="button"
              onClick={requestRestoreDefault}
              disabled={saving}
              className="btn-secondary flex shrink-0 items-center justify-center gap-2 text-sm"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              {t("documentsHub.restoreDefault")}
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
                  {t("documentsHub.setDefault")}
                </button>
              ) : undefined
            }
          />
        </section>
        </>}
      </div>


      <ConfirmDialog
        open={pendingAction !== null}
        onOpenChange={(open) => !open && setPendingAction(null)}
        title={
          pendingAction?.type === "restore"
            ? t("documentsHub.restoreConfirm")
            : t("documentsHub.discardConfirm")
        }
        description={
          pendingAction?.type === "restore"
            ? `${t("documentsHub.restoreDescription")}${dirty ? ` ${t("documentsHub.unsavedDiscard")}` : ""}`
            : pendingAction?.type === "section"
              ? t("documentsHub.switchSectionDescription")
              : t("documentsHub.switchTemplateDescription")
        }
        confirmLabel={
          pendingAction?.type === "restore"
            ? t("documentsHub.restoreDefault")
            : t("documentsHub.discardAndSwitch")
        }
        onConfirm={confirmPendingAction}
        loading={saving}
      />
    </div>
  );
}
