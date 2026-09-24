import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { FileCheck, FileSignature, Save, Send, Check, XCircle } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { ServiceAgreementStatusBadge } from "@/components/ui/ServiceAgreementStatusBadge";
import { AsyncButton } from "@/components/ui/AsyncButton";
import { AgreementContentView } from "@/components/AgreementContentView";
import { Link } from "wouter";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { StructuredAgreementEditor } from "./StructuredAgreementEditor";
import { AgreementReviewItems } from "./AgreementReviewItems";
import { AgreementTemplateChooser } from "./AgreementTemplateChooser";
import { EMPTY_AGREEMENT_FORM, agreementFormFromRecord, agreementFormIsDirty, sectionForReviewField } from "./agreementEditorModel";
import type { AgreementForm } from "./agreementEditorModel";

const FREQUENCIES = ["one_time", "weekly", "biweekly", "monthly", "quarterly", "custom"] as const;

type ToastType = "success" | "error";

type AgreementSource = {
  title?: string;
  clientName?: string;
  propertyAddress?: string;
  servicesIncluded?: string;
  priceSummary?: string;
  billingSchedule?: string;
  specialInstructions?: string;
  exceptions?: string;
  body?: string;
  serviceFrequency?: string;
  contractAmountCents?: number;
  effectiveStartDate?: string;
  renewalDate?: string;
  scopeOfWork?: string;
  notes?: string;
};

function centsFromPrice(value: string, invalidMessage: string) {
  if (!value.trim()) return undefined;
  const cents = Math.round(Number(value) * 100);
  if (!Number.isFinite(cents) || cents < 0) throw new Error(invalidMessage);
  return cents;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      {children}
    </label>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <div className="mt-1 text-sm text-gray-900">{value}</div>
    </div>
  );
}

export function ServiceAgreementCard({
  proposalId,
  commercialAccountId,
  canCreate,
  hideWhenMissing,
  onInviteClient,
  accessManagementHref,
  source,
  onToast,
}: {
  proposalId?: Id<"proposals">;
  commercialAccountId?: Id<"commercialAccounts">;
  canCreate?: boolean;
  hideWhenMissing?: boolean;
  onInviteClient?: () => void;
  accessManagementHref?: string;
  source?: AgreementSource;
  onToast?: (message: string, type: ToastType) => void;
}) {
  const { user, sessionToken } = useAuth();
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [form, setForm] = useState<AgreementForm>(EMPTY_AGREEMENT_FORM);
  const [savedForm, setSavedForm] = useState<AgreementForm>(EMPTY_AGREEMENT_FORM);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateConfirmOpen, setTemplateConfirmOpen] = useState(false);
  const [pendingPreviewAt, setPendingPreviewAt] = useState<number | null>(null);
  const [pendingRevisionOpen, setPendingRevisionOpen] = useState(false);

  const agreementByProposal = useQuery(
    (api as any).queries.serviceAgreements.getByProposal,
    proposalId && user ? { userId: user._id, sessionToken, proposalId } : "skip"
  );
  const agreementByAccount = useQuery(
    (api as any).queries.serviceAgreements.getByCommercialAccount,
    !proposalId && commercialAccountId && user
      ? { userId: user._id, sessionToken, commercialAccountId }
      : "skip"
  );
  const agreement = proposalId ? agreementByProposal : agreementByAccount;

  const createDraft = useMutation(
    (api as any).mutations.serviceAgreements.createDraftFromAcceptedProposal
  );
  const updateAgreement = useMutation((api as any).mutations.serviceAgreements.update);
  const markReady = useMutation((api as any).mutations.serviceAgreements.markReady);
  const recordOutsideSend = useMutation((api as any).mutations.serviceAgreements.markSent);
  const sendAgreement = useAction(
    (api as any).serviceAgreementDeliveryActions.sendServiceAgreement
  );
  const markSigned = useMutation((api as any).mutations.serviceAgreements.markSigned);
  const markCancelled = useMutation((api as any).mutations.serviceAgreements.markCancelled);
  const returnToDraft = useMutation((api as any).mutations.serviceAgreements.returnToDraft);
  const applyTemplate = useMutation((api as any).mutations.serviceAgreements.applyApprovedTemplate);
  const templateChoices = useQuery((api as any).queries.documentTemplates.listServiceAgreementChoicesForSales,
    user && templateOpen ? { userId: user._id, sessionToken } : "skip");
  const templateCandidate = useQuery((api as any).queries.serviceAgreements.previewTemplateApplication,
    user && agreement?.contentMode === "structured" && templateOpen && selectedTemplateId
      ? { userId: user._id, sessionToken, agreementId: agreement._id, templateId: selectedTemplateId as Id<"documentTemplates"> }
      : "skip");

  useEffect(() => {
    if (agreement && agreement._id !== loadedId) {
      const initial = agreementFormFromRecord(agreement);
      setForm(initial);
      setSavedForm(initial);
      setEditing(agreement.status === "draft");
      setLoadedId(agreement._id);
    }
  }, [agreement, loadedId]);

  useEffect(() => {
    if (agreement || !source || loadedId === "source") return;
    setForm({
      ...EMPTY_AGREEMENT_FORM,
      title: source.title ?? t("serviceAgreements.defaultTitle"),
      clientName: source.clientName ?? "",
      propertyAddress: source.propertyAddress ?? "",
      servicesIncluded: source.servicesIncluded ?? source.scopeOfWork ?? "",
      priceSummary: source.priceSummary ?? "",
      billingSchedule: source.billingSchedule ?? "",
      specialInstructions: source.specialInstructions ?? source.notes ?? "",
      exceptions: source.exceptions ?? "",
      body: source.body ?? "",
      effectiveStartDate: source.effectiveStartDate ?? "",
      renewalDate: source.renewalDate ?? "",
      serviceFrequency: source.serviceFrequency ?? "",
      contractAmount:
        source.contractAmountCents != null ? String(source.contractAmountCents / 100) : "",
      scopeOfWork: source.scopeOfWork ?? "",
      notes: source.notes ?? "",
    });
    setLoadedId("source");
  }, [agreement, source, loadedId, t]);

  const dirty = agreementFormIsDirty(form, savedForm);
  useEffect(() => {
    if (pendingPreviewAt !== null && agreement?.updatedAt >= pendingPreviewAt) {
      setPendingPreviewAt(null);
      if (!dirty) setEditing(false);
    }
  }, [agreement?.updatedAt, pendingPreviewAt, dirty]);

  useEffect(() => {
    if (pendingRevisionOpen && agreement?.status === "draft") {
      setEditing(true);
      setPendingRevisionOpen(false);
    }
  }, [pendingRevisionOpen, agreement?.status]);

  useEffect(() => {
    if (!dirty || !agreement || agreement.contentMode !== "structured") return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, agreement]);

  if (!user || agreement === undefined) {
    return (
      <section className="card space-y-3">
        <div className="flex items-center gap-2">
          <FileSignature className="h-5 w-5 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900">{t("serviceAgreements.title")}</h3>
        </div>
        <p className="text-sm text-gray-500">{t("common.loading")}</p>
      </section>
    );
  }

  const showToast = (message: string, type: ToastType) => {
    onToast?.(message, type);
  };

  const handleCreate = async () => {
    if (!proposalId) return;
    setActionLoading("create");
    try {
      await createDraft({ userId: user._id, sessionToken, proposalId });
      setEditing(true);
      showToast(t("serviceAgreements.created"), "success");
    } catch (err: any) {
      showToast(err.message || t("serviceAgreements.actionFailed"), "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSave = async () => {
    if (!agreement) return;
    setSaving(true);
    try {
      const updatedAt = await updateAgreement({
        userId: user._id,
        sessionToken,
        agreementId: agreement._id,
        title: form.title,
        clientName: form.clientName || undefined,
        propertyAddress: form.propertyAddress || undefined,
        servicesIncluded: form.servicesIncluded || undefined,
        priceSummary: form.priceSummary || undefined,
        billingSchedule: form.billingSchedule || undefined,
        specialInstructions: form.specialInstructions || undefined,
        exceptions: form.exceptions || undefined,
        body: agreement.contentMode === "structured" ? undefined : form.body || undefined,
        effectiveStartDate: form.effectiveStartDate || undefined,
        effectiveEndDate: form.effectiveEndDate || undefined,
        renewalDate: form.renewalDate || undefined,
        serviceFrequency: form.serviceFrequency || undefined,
        contractAmountCents: centsFromPrice(
          form.contractAmount,
          t("serviceAgreements.invalidAmount")
        ),
        paymentTerms: form.paymentTerms || undefined,
        scopeOfWork: form.scopeOfWork || undefined,
        terms: form.terms || undefined,
        notes: form.notes || undefined,
      });
      setSavedForm(form);
      if (agreement.contentMode === "structured") {
        setPendingPreviewAt(typeof updatedAt === "number" ? updatedAt : (agreement.updatedAt ?? 0) + 1);
      }
      else setEditing(false);
      showToast(t("serviceAgreements.saved"), "success");
    } catch (err: any) {
      showToast(err.message || t("serviceAgreements.saveFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const requestReview = () => {
    if (dirty) { setDiscardOpen(true); return; }
    setEditing(false);
  };

  const goToReviewField = (field: string) => {
    const section = sectionForReviewField(field);
    if (!section) return;
    setEditing(true);
    window.setTimeout(() => {
      document.getElementById(`agreement-field-${field}`)?.focus();
      document.getElementById(`agreement-section-${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  const handleTemplateApply = async () => {
    if (!agreement || !selectedTemplateId || dirty ||
      templateCandidate?.authoringReview?.template?.id !== selectedTemplateId) return;
    setActionLoading("template");
    try {
      await applyTemplate({ userId: user._id, sessionToken, agreementId: agreement._id,
        templateId: selectedTemplateId as Id<"documentTemplates"> });
      setTemplateConfirmOpen(false);
      setTemplateOpen(false);
      setSelectedTemplateId(null);
      showToast(t("serviceAgreements.v2.templateApplied"), "success");
    } catch (err: any) {
      showToast(err.message || t("serviceAgreements.actionFailed"), "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleAction = async (action: "ready" | "sent" | "outside" | "signed" | "cancelled" | "change") => {
    if (!agreement) return;
    setActionLoading(action);
    try {
      if (action === "ready") await markReady({ userId: user._id, sessionToken, agreementId: agreement._id });
      if (action === "sent") {
        await sendAgreement({ userId: user._id, sessionToken, agreementId: agreement._id });
      }
      if (action === "outside") await recordOutsideSend({ userId: user._id, sessionToken, agreementId: agreement._id });
      if (action === "signed") await markSigned({ userId: user._id, sessionToken, agreementId: agreement._id });
      if (action === "cancelled") {
        await markCancelled({ userId: user._id, sessionToken, agreementId: agreement._id });
      }
      if (action === "change") {
        await returnToDraft({ userId: user._id, sessionToken, agreementId: agreement._id });
        setPendingRevisionOpen(true);
      }
      showToast(action === "change" ? t("serviceAgreements.changeSuccess") : t(`serviceAgreements.${action}Success`), "success");
    } catch (err: any) {
      const message = err.message?.includes("Active Client Portal access")
        ? t("serviceAgreements.portalAccess.emailBlocked")
        : err.message?.includes("client email")
        ? t("serviceAgreements.recipientEmailRequired")
        : err.message || t("serviceAgreements.actionFailed");
      showToast(message, "error");
    } finally {
      setActionLoading(null);
    }
  };

  const canEdit = agreement && ["draft", "ready"].includes(agreement.status);
  const structuredEditable = canEdit && agreement.contentMode === "structured";
  const portalAccess = agreement?.portalAccess;
  const canManageClients = user.role === "owner" || user.canManageClients === true;
  const canInvite = portalAccess?.relationshipActive && portalAccess.recipientEmailAvailable &&
    ["not_invited", "invitation_pending", "client_user_inactive"].includes(portalAccess.status);
  const deliveryAttempt = agreement?.latestDeliveryAttempt;
  const deliveryGuidanceKey = deliveryAttempt?.result === "failed"
    ? "serviceAgreements.deliveryFailed"
    : deliveryAttempt?.result === "unknown"
      ? "serviceAgreements.deliveryUnknown"
      : deliveryAttempt?.result === "pending"
        ? "serviceAgreements.deliveryPending"
        : agreement?.sentAt && deliveryAttempt?.channel === "owner_reported_outside_send" && deliveryAttempt.result === "owner_reported"
          ? "serviceAgreements.outsideSendRecorded"
          : agreement?.sentAt && deliveryAttempt?.channel === "email" && deliveryAttempt.result === "provider_accepted"
            ? "serviceAgreements.afterSendGuidance"
            : agreement?.sentAt
              ? "serviceAgreements.deliveryUnverified"
              : null;

  if (!agreement && hideWhenMissing) return null;

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileSignature className="h-5 w-5 text-gray-400" />
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{t("serviceAgreements.title")}</h3>
            <p className="text-xs text-gray-500">{t("serviceAgreements.manualSigningNote")}</p>
            {deliveryGuidanceKey && (
              <p className="mt-2 max-w-2xl text-xs text-amber-700">{t(deliveryGuidanceKey)}</p>
            )}
            {agreement?.clientRelationship && (
              <p className="mt-2 inline-flex rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">
                {t("serviceAgreements.v2.clientRelationship")}: {agreement.clientRelationship.displayName}
              </p>
            )}
          </div>
        </div>
        {(agreement || !hideWhenMissing) && <ServiceAgreementStatusBadge agreement={agreement} />}
      </div>

      {structuredEditable && <div role="tablist" aria-label={t("serviceAgreements.v2.modeLabel")} className="flex w-full gap-1 rounded-lg bg-gray-100 p-1 sm:w-fit">
        <button type="button" role="tab" aria-selected={editing} onClick={() => setEditing(true)} className={`min-w-0 flex-1 rounded-md px-4 py-2 text-sm font-medium sm:flex-none ${editing ? "bg-white text-primary-700 shadow-sm" : "text-gray-600"}`}>{t("serviceAgreements.v2.editTab")}</button>
        <button type="button" role="tab" aria-selected={!editing} onClick={requestReview} className={`min-w-0 flex-1 rounded-md px-4 py-2 text-sm font-medium sm:flex-none ${!editing ? "bg-white text-primary-700 shadow-sm" : "text-gray-600"}`}>{t("serviceAgreements.v2.reviewTab")}</button>
      </div>}

      {!agreement ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">{t("serviceAgreements.emptyDesc")}</p>
          {canCreate && (
            <button
              type="button"
              onClick={handleCreate}
              disabled={actionLoading === "create"}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <FileSignature className="h-4 w-4" />
              {actionLoading === "create" ? t("common.saving") : t("serviceAgreements.create")}
            </button>
          )}
        </div>
      ) : structuredEditable && editing ? (
        <div role="tabpanel" className="min-w-0 space-y-4">
          {templateOpen && <AgreementTemplateChooser
            choices={templateChoices} selectedId={selectedTemplateId} currentId={agreement.templateId}
            candidate={templateCandidate?.authoringReview?.template?.id === selectedTemplateId ? templateCandidate : undefined}
            loading={Boolean(selectedTemplateId && templateCandidate === undefined)}
            applying={actionLoading === "template"} blocked={dirty} onSelect={setSelectedTemplateId} onApply={handleTemplateApply}
            onClose={() => { setTemplateOpen(false); setSelectedTemplateId(null); }}
            confirmOpen={templateConfirmOpen} onConfirmOpenChange={setTemplateConfirmOpen} />}
          <StructuredAgreementEditor form={form} onChange={(field, value) => { setTemplateConfirmOpen(false); setForm((previous) => ({ ...previous, [field]: value })); }}
            onSave={handleSave} onCancel={requestReview} saving={saving || pendingPreviewAt !== null} dirty={dirty}
            onChangeTemplate={() => dirty ? showToast(t("serviceAgreements.v2.saveBeforeTemplate"), "error") : setTemplateOpen(true)}
            onUnsavedNavigation={() => showToast(t("serviceAgreements.v2.saveBeforeNavigation"), "error")}
            template={{ name: agreement.authoringReview?.template?.name ?? t("serviceAgreements.v2.defaultTemplate"),
              version: agreement.authoringReview?.template?.version, fallback: agreement.authoringReview?.template?.fallback ?? true }}
            canManageTemplates={user.role === "owner" || user.canManageDocuments === true}
            addOns={agreement.acceptedProposalAddOnSnapshots ?? []} revision={agreement.hasPriorIssue} />
        </div>
      ) : editing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("serviceAgreements.agreementTitle")}>
              <input
                className="input-field mt-1"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </Field>
            <Field label={t("serviceAgreements.clientName")}>
              <input
                className="input-field mt-1"
                value={form.clientName}
                onChange={(e) => setForm({ ...form, clientName: e.target.value })}
              />
            </Field>
            <Field label={t("serviceAgreements.propertyAddress")}>
              <input
                className="input-field mt-1"
                value={form.propertyAddress}
                onChange={(e) => setForm({ ...form, propertyAddress: e.target.value })}
              />
            </Field>
            <Field label={t("serviceAgreements.contractAmount")}>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input-field mt-1"
                value={form.contractAmount}
                onChange={(e) => setForm({ ...form, contractAmount: e.target.value })}
              />
            </Field>
            <Field label={t("serviceAgreements.frequency")}>
              <select
                className="input-field mt-1"
                value={form.serviceFrequency}
                onChange={(e) => setForm({ ...form, serviceFrequency: e.target.value })}
              >
                <option value="">{t("common.select")}</option>
                {FREQUENCIES.map((frequency) => (
                  <option key={frequency} value={frequency}>
                    {t(`leadFrequencies.${frequency}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("serviceAgreements.effectiveStartDate")}>
              <input
                type="date"
                className="input-field mt-1"
                value={form.effectiveStartDate}
                onChange={(e) => setForm({ ...form, effectiveStartDate: e.target.value })}
              />
            </Field>
            <Field label={t("serviceAgreements.effectiveEndDate")}>
              <input
                type="date"
                className="input-field mt-1"
                value={form.effectiveEndDate}
                onChange={(e) => setForm({ ...form, effectiveEndDate: e.target.value })}
              />
            </Field>
            <Field label={t("serviceAgreements.renewalDate")}>
              <input
                type="date"
                className="input-field mt-1"
                value={form.renewalDate}
                onChange={(e) => setForm({ ...form, renewalDate: e.target.value })}
              />
            </Field>
          </div>
          <Field label={t("serviceAgreements.servicesIncluded")}>
            <textarea
              className="input-field mt-1"
              rows={3}
              value={form.servicesIncluded}
              onChange={(e) => setForm({ ...form, servicesIncluded: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("serviceAgreements.priceSummary")}>
              <input
                className="input-field mt-1"
                value={form.priceSummary}
                onChange={(e) => setForm({ ...form, priceSummary: e.target.value })}
              />
            </Field>
            <Field label={t("serviceAgreements.billingSchedule")}>
              <input
                className="input-field mt-1"
                value={form.billingSchedule}
                onChange={(e) => setForm({ ...form, billingSchedule: e.target.value })}
              />
            </Field>
          </div>
          <p className="text-xs text-gray-600">{t("serviceAgreements.pricingConsistencyHelp")}</p>
          <Field label={t("serviceAgreements.paymentTerms")}>
            <input
              className="input-field mt-1"
              value={form.paymentTerms}
              onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}
            />
          </Field>
          <Field label={t("serviceAgreements.scopeOfWork")}>
            <textarea
              className="input-field mt-1"
              rows={3}
              value={form.scopeOfWork}
              onChange={(e) => setForm({ ...form, scopeOfWork: e.target.value })}
            />
          </Field>
          <Field label={t("serviceAgreements.specialInstructions")}>
            <textarea
              className="input-field mt-1"
              rows={3}
              value={form.specialInstructions}
              onChange={(e) => setForm({ ...form, specialInstructions: e.target.value })}
            />
          </Field>
          <Field label={t("serviceAgreements.exceptions")}>
            <textarea
              className="input-field mt-1"
              rows={3}
              value={form.exceptions}
              onChange={(e) => setForm({ ...form, exceptions: e.target.value })}
            />
          </Field>
          <Field label={t("serviceAgreements.terms")}>
            <textarea
              className="input-field mt-1"
              rows={3}
              value={form.terms}
              onChange={(e) => setForm({ ...form, terms: e.target.value })}
            />
          </Field>
          {agreement.contentMode === "structured" ? (
            <p className="text-sm text-gray-600">{t("serviceAgreements.generatedBodyHelp")}</p>
          ) : <Field label={t("serviceAgreements.legacyBodyOverride")}>
            <textarea
              className="input-field mt-1 font-mono text-xs"
              rows={10}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </Field>}
          <Field label={t("serviceAgreements.internalNotes")}>
            <textarea
              className="input-field mt-1"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <Save className="h-4 w-4" />
              {saving ? t("common.saving") : t("serviceAgreements.save")}
            </button>
            <button type="button" onClick={() => dirty ? setDiscardOpen(true) : setEditing(false)} className="btn-secondary text-sm">
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {structuredEditable && <>
            <div className="rounded-lg border border-primary-100 bg-primary-50 p-4">
              <h4 className="font-semibold text-gray-900">{t("serviceAgreements.v2.previewHeading")}</h4>
              <p className="mt-1 text-sm text-gray-700">{t("serviceAgreements.v2.savedPreviewHelp")}</p>
              <p className="mt-2 break-words text-xs text-gray-600">{t("serviceAgreements.v2.templateLabel")}: {agreement.authoringReview?.template?.name ?? t("serviceAgreements.v2.defaultTemplate")}
                {agreement.authoringReview?.template?.version != null && !agreement.authoringReview?.template?.fallback ? ` · v${agreement.authoringReview.template.version}` : ""}
                {agreement.authoringReview?.template?.fallback ? ` (${t("serviceAgreements.v2.scrubFallback")})` : ""}
              </p>
              {dirty && <p className="mt-2 text-sm font-medium text-amber-800">{t("serviceAgreements.v2.unsavedPreviewHelp")}</p>}
              {agreement.hasPriorIssue && <p className="mt-2 text-sm text-gray-700">{t("serviceAgreements.v2.revisionNote")}</p>}
            </div>
            <AgreementReviewItems review={agreement.authoringReview} onGoToField={goToReviewField} />
          </>}
          <p className="break-words text-sm font-semibold text-gray-700">{t("serviceAgreements.clientPreview")}: {agreement.canonicalPreview?.title}</p>
          {["sent", "signed", "cancelled"].includes(agreement.status) && !agreement.currentIssueId && (
            <p className="text-xs text-amber-700">{t("serviceAgreements.legacyNoIssue")}</p>
          )}
          {agreement.canonicalPreview && <AgreementContentView content={agreement.canonicalPreview} audience="owner" />}
          {agreement.notes && (
            structuredEditable ? <aside className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-semibold text-gray-800">{t("serviceAgreements.v2.sections.notes")}</p>
              <p className="mt-1 text-xs text-gray-600">{t("serviceAgreements.v2.internalOnly")}</p>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-800">{agreement.notes}</p>
            </aside> : <Detail label={t("serviceAgreements.internalNotes")}
              value={<p className="whitespace-pre-wrap">{agreement.notes}</p>} />
          )}
        </div>
      )}

      {agreement && ["draft", "ready", "sent"].includes(agreement.status) && portalAccess && (
        <div className={`rounded-md border p-3 text-sm ${portalAccess.canEmail ? "border-green-200 bg-green-50 text-green-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          <p>{t(`serviceAgreements.portalAccess.${portalAccess.status}`)}</p>
          {!portalAccess.canEmail && (
            <>
              <p className="mt-1">{t("serviceAgreements.portalAccess.outsideSend")}</p>
              {canManageClients ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {canInvite && onInviteClient && (
                    <button type="button" onClick={onInviteClient} className="btn-secondary text-sm">
                      {t("serviceAgreements.portalAccess.invite")}
                    </button>
                  )}
                  {accessManagementHref && (
                    <Link href={accessManagementHref} className="btn-secondary text-sm">
                      {t("serviceAgreements.portalAccess.manage")}
                    </Link>
                  )}
                </div>
              ) : <p className="mt-2 font-medium">{t("serviceAgreements.portalAccess.handoff")}</p>}
            </>
          )}
        </div>
      )}

      {agreement && !editing && (
        <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
          {canEdit && !structuredEditable && (
            <button type="button" onClick={() => setEditing(true)} className="btn-secondary text-sm">
              {t("serviceAgreements.edit")}
            </button>
          )}
          {agreement.status === "sent" && (
            <button type="button" onClick={() => handleAction("change")} disabled={actionLoading !== null} className="btn-secondary text-sm">
              {t("serviceAgreements.makeChanges")}
            </button>
          )}
          {agreement.status === "draft" && !structuredEditable && (
            <button
              type="button"
              onClick={() => handleAction("ready")}
              disabled={actionLoading === "ready"}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <FileCheck className="h-4 w-4" />
              {actionLoading === "ready" ? t("common.saving") : t("serviceAgreements.markReady")}
            </button>
          )}
          {["draft", "ready", "sent"].includes(agreement.status) && (
            <AsyncButton
              type="button"
              onClick={() => handleAction("sent")}
              pending={actionLoading === "sent"}
              pendingLabel={t("common.sending")}
              disabled={!portalAccess?.canEmail || (structuredEditable && dirty) || (actionLoading !== null && actionLoading !== "sent")}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <Send aria-hidden="true" className="h-4 w-4" />
              {agreement.status === "sent" ? t("serviceAgreements.resendUnchanged") : structuredEditable ? t("serviceAgreements.v2.issueEmail") : t("serviceAgreements.send")}
            </AsyncButton>
          )}
          {["draft", "ready"].includes(agreement.status) && (
            <button type="button" onClick={() => handleAction("outside")} disabled={actionLoading !== null || (structuredEditable && dirty)} className="btn-secondary flex items-center gap-2 text-sm">
              <Send aria-hidden="true" className="h-4 w-4" />
              {actionLoading === "outside" ? t("common.saving") : t("serviceAgreements.recordOutsideSend")}
            </button>
          )}
          {(agreement.status === "sent" || (agreement.status === "signed" && !agreement.signedAt)) && (
            <button
              type="button"
              onClick={() => handleAction("signed")}
              disabled={actionLoading === "signed"}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <Check className="h-4 w-4" />
              {actionLoading === "signed"
                ? t("common.saving")
                : t("serviceAgreements.markSignedOutside")}
            </button>
          )}
          {["draft", "ready", "sent"].includes(agreement.status) && (
            <button
              type="button"
              onClick={() => handleAction("cancelled")}
              disabled={actionLoading === "cancelled" || (structuredEditable && dirty)}
              className="btn-danger flex items-center gap-2 text-sm"
            >
              <XCircle className="h-4 w-4" />
              {actionLoading === "cancelled"
                ? t("common.saving")
                : t("serviceAgreements.markCancelled")}
            </button>
          )}
        </div>
      )}
      <ConfirmDialog open={discardOpen} onOpenChange={setDiscardOpen}
        title={t("serviceAgreements.v2.discardTitle")}
        description={t("serviceAgreements.v2.discardBody")}
        confirmLabel={t("serviceAgreements.v2.discardChanges")}
        confirmVariant="danger"
        onConfirm={() => { setForm(savedForm); setDiscardOpen(false); setEditing(false); }} />
    </section>
  );
}
