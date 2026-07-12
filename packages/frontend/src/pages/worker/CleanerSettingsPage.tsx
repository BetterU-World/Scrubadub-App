import { useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { Link } from "wouter";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { getStaffSessionToken, useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader, LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  AlertCircle,
  Banknote,
  BookOpen,
  CalendarClock,
  CheckCircle,
  ChevronRight,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Link2,
  LogOut,
  ShieldCheck,
  User,
  Wrench,
} from "lucide-react";

function formatLabel(value?: string | null) {
  if (!value) return "Not set";
  return value
    .split("_")
    .map((part) => part === "1099" ? part : part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
    .replace("W2", "W-2");
}

function formatDate(value?: number | string | null) {
  if (!value) return "Not set";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleDateString();
}

function formatMoney(cents?: number | null) {
  if (cents == null) return "Amount pending";
  return `$${(cents / 100).toFixed(2)}`;
}

function SectionCard({
  id,
  icon: Icon,
  title,
  action,
  children,
}: {
  id?: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="card scroll-mt-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-2 rounded-lg bg-gray-100 text-gray-600">
            <Icon className="w-4 h-4" />
          </div>
          <h2 className="font-semibold text-gray-900 truncate">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function SectionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700">
      {children}
      <ChevronRight className="w-4 h-4" />
    </Link>
  );
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase text-gray-400">{label}</p>
      <div className="mt-1 text-sm font-medium text-gray-900">{value}</div>
    </div>
  );
}

function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="text-sm text-gray-500">{children}</p>;
}

function isCompleteStatus(status?: string | null) {
  return status === "complete" || status === "reviewed" || status === "waived";
}

function isWorkerCompletable(item: any) {
  return item.status === "not_started" || item.status === "in_progress";
}

function isOwnerControlledOnboarding(item: any) {
  return item.status === "blocked" || item.status === "waived";
}

function itemText(item: any) {
  return `${item.itemKey ?? ""} ${item.title ?? ""}`.toLowerCase();
}

function documentText(document: any) {
  return `${document.documentType ?? ""}`.toLowerCase();
}

function isAgreementItem(item: any) {
  const text = itemText(item);
  return text.includes("agreement") || text.includes("nda") || text.includes("contract") || text.includes("handbook");
}

function isPolicyItem(item: any) {
  const text = itemText(item);
  return text.includes("policy") || text.includes("values") || text.includes("safety") || text.includes("expectation");
}

function isTrainingItem(item: any) {
  const text = itemText(item);
  return text.includes("training") || text.includes("manual") || text.includes("first_job");
}

function isAgreementDocument(document: any) {
  const text = documentText(document);
  return text.includes("agreement") || text.includes("handbook");
}

function isPolicyDocument(document: any) {
  return documentText(document).includes("policy");
}

function isTrainingDocument(document: any) {
  return documentText(document).includes("training");
}

function documentStatusMessage(document: any) {
  switch (document.status) {
    case "not_started":
    case "requested":
      return "Missing from worker records";
    case "received":
      return "Waiting for owner review";
    case "reviewed":
      return "Approved";
    case "expired":
      return "Expired - owner review needed";
    case "waived":
      return "Waived by owner";
    default:
      return formatLabel(document.status);
  }
}

function onboardingStatusMessage(item: any) {
  switch (item.status) {
    case "not_started":
      return "Ready for worker review";
    case "in_progress":
      return "In progress";
    case "complete":
      return item.completedAt ? `Completed ${formatDate(item.completedAt)}` : "Completed";
    case "blocked":
      return "Blocked - owner action required";
    case "waived":
      return "Waived by owner";
    default:
      return formatLabel(item.status);
  }
}

function companyDocumentText(document: any) {
  return `${document.documentKey ?? ""} ${document.title ?? ""}`.toLowerCase();
}

function matchesCompanyDocument(item: any, document: any) {
  const itemValue = itemText(item);
  const documentKey = document.documentKey ?? "";
  if (documentKey && itemValue.includes(documentKey)) return true;

  const matchTerms: Record<string, string[]> = {
    company_values: ["company values", "values"],
    worker_agreement: ["worker agreement"],
    contractor_agreement: ["contractor agreement", "contract"],
    employee_handbook: ["employee handbook", "handbook"],
    safety_policy: ["safety policy", "safety"],
    role_expectations: ["role expectations", "expectations"],
    nda: ["nda", "nondisclosure", "confidentiality"],
    additional_documents: ["additional document"],
  };

  return (matchTerms[documentKey] ?? []).some((term) => itemValue.includes(term));
}

function isAgreementCompanyDocument(document: any) {
  const text = companyDocumentText(document);
  return text.includes("agreement") || text.includes("nda") || text.includes("contract") || text.includes("handbook");
}

function isPolicyCompanyDocument(document: any) {
  const text = companyDocumentText(document);
  return text.includes("policy") || text.includes("values") || text.includes("expectation");
}

function isTrainingCompanyDocument(document: any) {
  return companyDocumentText(document).includes("training");
}

function ProfileBasicsSection({ user, workerProfile }: { user: any; workerProfile: any }) {
  return (
    <SectionCard id="profile" icon={User} title="Profile Basics">
      <div className="grid gap-4 sm:grid-cols-2">
        <DetailItem label="Name" value={user.name} />
        <DetailItem label="Email" value={user.email} />
        <DetailItem label="Phone" value={user.phone || "Not set"} />
        <DetailItem label="Role" value={formatLabel(workerProfile?.primaryRole ?? user.role)} />
        <DetailItem label="Company" value={user.companyName || "Not set"} />
        <DetailItem label="Worker Status" value={formatLabel(workerProfile?.workerStatus ?? user.status)} />
      </div>
    </SectionCard>
  );
}

function WorkPreferencesSection({ user, workerProfile }: { user: any; workerProfile: any }) {
  return (
    <SectionCard
      id="work-preferences"
      icon={CalendarClock}
      title="Work Preferences"
      action={<SectionLink href="/availability">Edit Availability</SectionLink>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <DetailItem label="Worker Type" value={formatLabel(workerProfile?.workerType)} />
        <DetailItem label="Primary Role" value={formatLabel(workerProfile?.primaryRole ?? user.role)} />
        <DetailItem
          label="Eligible Roles"
          value={(workerProfile?.eligibleRoles ?? []).length > 0
            ? workerProfile.eligibleRoles.map(formatLabel).join(", ")
            : formatLabel(user.role)}
        />
        <DetailItem label="Job Eligibility" value={formatLabel(workerProfile?.jobEligibilityStatus)} />
      </div>
      <p className="mt-4 text-sm text-gray-500">
        Availability changes are managed on the dedicated availability page so scheduling stays consistent.
      </p>
    </SectionCard>
  );
}

function OnboardingActionButton({
  item,
  onComplete,
  completing,
  disabledReason,
}: {
  item: any;
  onComplete: (item: any) => void;
  completing: boolean;
  disabledReason?: string | null;
}) {
  if (item.status === "complete") {
    return (
      <span className="badge bg-green-100 text-green-700">
        Completed
      </span>
    );
  }
  if (item.status === "waived") {
    return <span className="badge bg-gray-100 text-gray-700">Waived</span>;
  }
  if (item.status === "blocked") {
    return <span className="badge bg-red-100 text-red-700">Owner Action</span>;
  }
  if (!isWorkerCompletable(item)) {
    return <span className="badge bg-gray-100 text-gray-700">{formatLabel(item.status)}</span>;
  }
  if (disabledReason) {
    return <span className="badge bg-amber-100 text-amber-700">{disabledReason}</span>;
  }

  return (
    <button
      type="button"
      onClick={() => onComplete(item)}
      disabled={completing}
      className="btn-secondary flex items-center justify-center gap-1.5 text-sm"
    >
      {completing ? <LoadingSpinner size="sm" /> : <CheckCircle className="w-4 h-4" />}
      Mark Reviewed
    </button>
  );
}

function OnboardingItemRow({
  item,
  onComplete,
  completing,
  onOpenCompanyDocument,
}: {
  item: any;
  onComplete: (item: any) => void;
  completing: boolean;
  onOpenCompanyDocument?: (document: any) => void;
}) {
  const companyDocument = item.companyDocument;
  const waitingForOwnerUpload =
    item.status !== "complete" &&
    companyDocument?.required &&
    !companyDocument.storageId;

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">{item.title}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {item.required ? "Required" : "Optional"} - {onboardingStatusMessage(item)}
          </p>
        </div>
        <OnboardingActionButton
          item={item}
          onComplete={onComplete}
          completing={completing}
          disabledReason={waitingForOwnerUpload ? "Waiting for Owner Upload" : null}
        />
      </div>
      {companyDocument && (
        <div className="mt-3 flex flex-col gap-2 rounded bg-white px-2 py-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-700">{companyDocument.title}</p>
            <p className="text-xs text-gray-500">
              {companyDocument.storageId ? "PDF available" : "Waiting for owner upload"}
            </p>
          </div>
          {companyDocument.url ? (
            <button
              type="button"
              className="btn-secondary flex items-center justify-center gap-1.5 text-sm"
              onClick={() => onOpenCompanyDocument?.(companyDocument)}
            >
              <ExternalLink className="w-4 h-4" />
              Open PDF
            </button>
          ) : (
            <span className="badge bg-amber-100 text-amber-700">Waiting for Owner Upload</span>
          )}
        </div>
      )}
      {item.notes && (
        <p className="mt-2 rounded bg-white px-2 py-1.5 text-xs text-gray-500">{item.notes}</p>
      )}
    </div>
  );
}

function CompanyDocumentRow({
  document,
  onOpenCompanyDocument,
}: {
  document: any;
  onOpenCompanyDocument: (document: any) => void;
}) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">{document.title}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {document.required ? "Required" : "Optional"} - {document.storageId ? "PDF available" : "Waiting for owner upload"}
          </p>
        </div>
        {document.url ? (
          <button
            type="button"
            className="btn-secondary flex items-center justify-center gap-1.5 text-sm"
            onClick={() => onOpenCompanyDocument(document)}
          >
            <ExternalLink className="w-4 h-4" />
            Open PDF
          </button>
        ) : (
          <span className="badge bg-amber-100 text-amber-700">Waiting for Owner Upload</span>
        )}
      </div>
    </div>
  );
}

function DocumentRow({ document }: { document: any }) {
  const ownerAction =
    document.status === "received" ||
    document.status === "expired" ||
    document.status === "requested" ||
    document.status === "not_started";
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-900">{formatLabel(document.documentType)}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {document.required ? "Required" : "Optional"} - {documentStatusMessage(document)}
          </p>
          {document.reviewedAt && (
            <p className="text-xs text-gray-400 mt-0.5">Reviewed {formatDate(document.reviewedAt)}</p>
          )}
        </div>
        <span className={`badge ${isCompleteStatus(document.status) ? "bg-green-100 text-green-700" : ownerAction ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-700"}`}>
          {ownerAction ? "Owner Review" : formatLabel(document.status)}
        </span>
      </div>
      {document.notes && (
        <p className="mt-2 rounded bg-white px-2 py-1.5 text-xs text-gray-500">{document.notes}</p>
      )}
    </div>
  );
}

function ComplianceGroup({
  id,
  title,
  description,
  icon: Icon,
  onboardingItems,
  documents = [],
  companyDocuments = [],
  manuals = [],
  onComplete,
  completingItemId,
  onOpenCompanyDocument,
  onOpenManual,
  openingManualId,
}: {
  id: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  onboardingItems: any[];
  documents?: any[];
  companyDocuments?: any[];
  manuals?: any[];
  onComplete: (item: any) => void;
  completingItemId: string | null;
  onOpenCompanyDocument: (document: any) => void;
  onOpenManual?: (manualId: string) => void;
  openingManualId?: string | null;
}) {
  const hasItems = onboardingItems.length > 0 || documents.length > 0 || companyDocuments.length > 0 || manuals.length > 0;

  return (
    <section id={id} className="scroll-mt-6 rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-start gap-2">
        <div className="rounded-lg bg-gray-100 p-2 text-gray-600">
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
      </div>

      {!hasItems ? (
        <EmptyNote>Nothing assigned here yet.</EmptyNote>
      ) : (
        <div className="space-y-2">
          {onboardingItems.map((item) => (
            <OnboardingItemRow
              key={item._id}
              item={item}
              onComplete={onComplete}
              completing={completingItemId === item._id}
              onOpenCompanyDocument={onOpenCompanyDocument}
            />
          ))}
          {companyDocuments.map((document) => (
            <CompanyDocumentRow
              key={document.documentKey}
              document={document}
              onOpenCompanyDocument={onOpenCompanyDocument}
            />
          ))}
          {documents.map((document) => (
            <DocumentRow key={document._id} document={document} />
          ))}
          {manuals.map((manual) => (
            <div key={manual._id} className="flex flex-col gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">{manual.title}</p>
                {manual.description && <p className="text-xs text-gray-500 mt-0.5">{manual.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => onOpenManual?.(manual._id)}
                disabled={openingManualId === manual._id}
                className="btn-secondary flex items-center justify-center gap-1.5 text-sm"
              >
                {openingManualId === manual._id ? <LoadingSpinner size="sm" /> : <ExternalLink className="w-4 h-4" />}
                Open Manual
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ComplianceSummary({
  workerProfile,
  completedCount,
  totalCount,
  remainingCount,
  nextAction,
}: {
  workerProfile: any;
  completedCount: number;
  totalCount: number;
  remainingCount: number;
  nextAction: string;
}) {
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const eligibility = workerProfile?.jobEligibilityStatus ?? "manual_review";
  const isEligible = eligibility === "eligible" && remainingCount === 0;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-gray-900">Compliance Summary</h3>
            <span className={`badge ${isEligible ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
              {isEligible ? "Eligible for Work" : formatLabel(eligibility)}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">{nextAction}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <DetailItem label="Complete" value={completedCount} />
          <DetailItem label="Remaining" value={remainingCount} />
          <DetailItem label="Progress" value={`${progress}%`} />
        </div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-200">
        <div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function ComplianceHubSection({
  workerProfile,
  documents,
  companyDocuments,
  onboardingItems,
  manuals,
  completingItemId,
  completionError,
  onComplete,
  onOpenCompanyDocument,
  onOpenManual,
  openingManualId,
}: {
  workerProfile: any;
  documents: any[];
  companyDocuments: any[];
  onboardingItems: any[];
  manuals: any[];
  completingItemId: string | null;
  completionError: string | null;
  onComplete: (item: any) => void;
  onOpenCompanyDocument: (document: any) => void;
  onOpenManual: (manualId: string) => void;
  openingManualId: string | null;
}) {
  const requiredOnboarding = onboardingItems.filter((item) => item.required !== false);
  const requiredDocuments = documents.filter((document) => document.required !== false);
  const completedOnboarding = requiredOnboarding.filter((item) => isCompleteStatus(item.status));
  const completedDocuments = requiredDocuments.filter((document) => isCompleteStatus(document.status));
  const totalCount = requiredOnboarding.length + requiredDocuments.length;
  const completedCount = completedOnboarding.length + completedDocuments.length;
  const remainingCount = Math.max(totalCount - completedCount, 0);

  const companyDocumentByItemId = new Map<string, any>();
  const matchedCompanyDocumentKeys = new Set<string>();
  for (const item of onboardingItems) {
    const companyDocument = companyDocuments.find((document) => matchesCompanyDocument(item, document));
    if (companyDocument) {
      companyDocumentByItemId.set(item._id, companyDocument);
      matchedCompanyDocumentKeys.add(companyDocument.documentKey);
    }
  }

  const enrichedOnboardingItems = onboardingItems.map((item) => ({
    ...item,
    companyDocument: companyDocumentByItemId.get(item._id),
  }));
  const workerActionItems = requiredOnboarding.filter((item) => {
    const companyDocument = companyDocumentByItemId.get(item._id);
    return isWorkerCompletable(item) && !(companyDocument?.required && !companyDocument.storageId);
  });
  const waitingDocuments = documents.filter((document) => !isCompleteStatus(document.status));
  const waitingCompanyDocuments = companyDocuments.filter((document) => document.required && !document.storageId);
  const blockedItems = onboardingItems.filter((item) => item.status === "blocked");
  const firstWorkerAction = workerActionItems[0];
  const nextAction = firstWorkerAction
    ? `Next: review and mark "${firstWorkerAction.title}" complete.`
    : waitingCompanyDocuments.length > 0
      ? `Next: wait for owner upload of "${waitingCompanyDocuments[0].title}".`
    : waitingDocuments.length > 0
      ? "Next: wait for owner review or follow your owner's document instructions."
      : blockedItems.length > 0
        ? "Next: contact your owner to resolve blocked onboarding items."
        : remainingCount === 0
          ? "All assigned compliance items are complete."
          : "Review your remaining assigned compliance items.";

  const workerVisibleItems = enrichedOnboardingItems.filter((item) => !isOwnerControlledOnboarding(item));
  const agreementItems = workerVisibleItems.filter(isAgreementItem);
  const policyItems = workerVisibleItems.filter((item) => isPolicyItem(item) && !isAgreementItem(item));
  const trainingItems = workerVisibleItems.filter((item) => isTrainingItem(item) && !isAgreementItem(item) && !isPolicyItem(item));
  const otherOnboardingItems = workerVisibleItems.filter(
    (item) => !agreementItems.includes(item) && !policyItems.includes(item) && !trainingItems.includes(item)
  );
  const agreementDocuments = documents.filter(isAgreementDocument);
  const policyDocuments = documents.filter(isPolicyDocument);
  const trainingDocuments = documents.filter(isTrainingDocument);
  const otherDocuments = documents.filter(
    (document) => !agreementDocuments.includes(document) && !policyDocuments.includes(document) && !trainingDocuments.includes(document)
  );
  const ownerReviewDocuments = documents.filter((document) => !isCompleteStatus(document.status));
  const ownerReviewItems = enrichedOnboardingItems.filter(isOwnerControlledOnboarding);
  const unmatchedCompanyDocuments = companyDocuments.filter((document) => !matchedCompanyDocumentKeys.has(document.documentKey));
  const agreementCompanyDocuments = unmatchedCompanyDocuments.filter(isAgreementCompanyDocument);
  const policyCompanyDocuments = unmatchedCompanyDocuments.filter((document) => isPolicyCompanyDocument(document) && !isAgreementCompanyDocument(document));
  const trainingCompanyDocuments = unmatchedCompanyDocuments.filter(
    (document) => isTrainingCompanyDocument(document) && !isAgreementCompanyDocument(document) && !isPolicyCompanyDocument(document)
  );
  const otherCompanyDocuments = unmatchedCompanyDocuments.filter(
    (document) => !agreementCompanyDocuments.includes(document) && !policyCompanyDocuments.includes(document) && !trainingCompanyDocuments.includes(document)
  );

  return (
    <SectionCard id="compliance" icon={ShieldCheck} title="Compliance & Onboarding" action={<SectionLink href="/">Back to Home</SectionLink>}>
      {!workerProfile ? (
        <EmptyNote>Your worker profile has not been initialized yet.</EmptyNote>
      ) : (
        <div className="space-y-4">
          <ComplianceSummary
            workerProfile={workerProfile}
            completedCount={completedCount}
            totalCount={totalCount}
            remainingCount={remainingCount}
            nextAction={nextAction}
          />

          {completionError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {completionError}
            </div>
          )}

          <ComplianceGroup
            id="agreements"
            title="Agreements"
            description="Review and acknowledge assigned agreements."
            icon={ClipboardCheck}
            onboardingItems={agreementItems}
            companyDocuments={agreementCompanyDocuments}
            documents={agreementDocuments}
            onComplete={onComplete}
            completingItemId={completingItemId}
            onOpenCompanyDocument={onOpenCompanyDocument}
          />
          <ComplianceGroup
            id="policies"
            title="Company Policies"
            description="Read company expectations and mark required policies reviewed."
            icon={ShieldCheck}
            onboardingItems={policyItems}
            companyDocuments={policyCompanyDocuments}
            documents={policyDocuments}
            onComplete={onComplete}
            completingItemId={completingItemId}
            onOpenCompanyDocument={onOpenCompanyDocument}
          />
          <ComplianceGroup
            id="training"
            title="Training"
            description="Open training manuals and complete assigned training checklist items."
            icon={BookOpen}
            onboardingItems={[...trainingItems, ...otherOnboardingItems]}
            companyDocuments={trainingCompanyDocuments}
            documents={trainingDocuments}
            manuals={manuals}
            onComplete={onComplete}
            completingItemId={completingItemId}
            onOpenCompanyDocument={onOpenCompanyDocument}
            onOpenManual={onOpenManual}
            openingManualId={openingManualId}
          />
          <ComplianceGroup
            id="documents"
            title="Documents"
            description="Open company-provided documents here. Worker uploads remain off for V1."
            icon={FileText}
            onboardingItems={[]}
            companyDocuments={otherCompanyDocuments}
            documents={otherDocuments}
            onComplete={onComplete}
            completingItemId={completingItemId}
            onOpenCompanyDocument={onOpenCompanyDocument}
          />
          <ComplianceGroup
            id="owner-review"
            title="Owner Review / Waiting on Owner"
            description="These items need owner review, waiver, or follow-up before they are fully compliant."
            icon={AlertCircle}
            onboardingItems={ownerReviewItems}
            documents={ownerReviewDocuments}
            onComplete={onComplete}
            completingItemId={completingItemId}
            onOpenCompanyDocument={onOpenCompanyDocument}
          />
        </div>
      )}
    </SectionCard>
  );
}

function PaymentsSection({
  connectStatus,
  payments,
  loading,
  error,
  accountIdSuffix,
  isConnected,
  onConnect,
}: {
  connectStatus: any;
  payments: any[];
  loading: boolean;
  error: string | null;
  accountIdSuffix: string | null;
  isConnected: boolean;
  onConnect: () => void;
}) {
  const openPayments = payments.filter((payment) => payment.paymentStatus !== "PAID");
  const paidPayments = payments.filter((payment) => payment.paymentStatus === "PAID");
  const nextOpenPayment = openPayments[0];

  return (
    <SectionCard id="payments" icon={Banknote} title="Payments" action={<SectionLink href="/payments">Open Payments</SectionLink>}>
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-gray-50 px-3 py-3">
          <p className="text-xs text-gray-500">Open Payment Items</p>
          <p className="text-xl font-bold text-gray-900">{openPayments.length}</p>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-3">
          <p className="text-xs text-gray-500">Paid Items</p>
          <p className="text-xl font-bold text-gray-900">{paidPayments.length}</p>
        </div>
      </div>

      {nextOpenPayment && (
        <p className="mt-3 text-sm text-gray-600">
          Next open item: <span className="font-medium text-gray-900">{nextOpenPayment.jobLabel}</span> - {formatMoney(nextOpenPayment.plannedPayCents)}
        </p>
      )}

      <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
        {isConnected ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 text-green-600">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Stripe Connected</p>
                <p className="text-sm text-gray-500">Account ...{accountIdSuffix}</p>
              </div>
            </div>
            <button
              onClick={onConnect}
              disabled={loading}
              className="btn-secondary flex items-center justify-center gap-2"
            >
              <Link2 className="w-4 h-4" />
              {loading ? "Redirecting..." : "Update Stripe Info"}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gray-100 text-gray-500">
                <Link2 className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Connect Stripe</p>
                <p className="text-sm text-gray-500">
                  Set up your account so your employer can pay you through SCRUB.
                </p>
              </div>
            </div>
            <button
              onClick={onConnect}
              disabled={loading}
              className="btn-primary flex items-center justify-center gap-2"
            >
              <Link2 className="w-4 h-4" />
              {loading ? "Redirecting..." : "Connect Stripe"}
            </button>
          </div>
        )}
      </div>

      {connectStatus?.stripeConnectPayoutsEnabled === false && isConnected && (
        <p className="mt-3 text-sm text-amber-700">
          Stripe is connected, but payouts may still need attention in Stripe.
        </p>
      )}
    </SectionCard>
  );
}

function AccountSection({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <SectionCard id="account" icon={Wrench} title="Account">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Notifications</p>
            <p className="text-xs text-gray-500">View your current app notifications.</p>
          </div>
          <SectionLink href="/notifications">View Notifications</SectionLink>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Password</p>
            <p className="text-xs text-gray-500">
              Password resets are available from the sign-in screen for {email}.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="btn-secondary flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </SectionCard>
  );
}

export function CleanerSettingsPage() {
  const { user, signOut } = useAuth();
  const connectStatus = useQuery(
    api.queries.cleanerStripeConnect.getCleanerConnectStatus,
    user?._id ? { userId: user._id, sessionToken: getStaffSessionToken() } : "skip"
  );
  const workerProfile = useQuery(
    (api as any).queries.workers.getWorkerProfileForUser,
    user?._id ? { userId: user._id } : "skip"
  );
  const documents = useQuery(
    (api as any).queries.workers.listWorkerDocuments,
    user?._id && workerProfile?._id ? { userId: user._id, workerProfileId: workerProfile._id } : "skip"
  );
  const onboardingItems = useQuery(
    (api as any).queries.workers.listWorkerOnboardingItems,
    user?._id && workerProfile?._id ? { userId: user._id, workerProfileId: workerProfile._id } : "skip"
  );
  const manuals = useQuery(
    api.queries.manuals.getVisibleManuals,
    user?._id ? { userId: user._id } : "skip"
  );
  const companyDocuments = useQuery(
    (api as any).queries.companyOnboardingDocuments.listForWorker,
    user?._id ? { userId: user._id } : "skip"
  );
  const payments = useQuery(
    api.queries.cleanerPayments.listCleanerJobsWithPaymentStatus,
    user?._id ? { userId: user._id } : "skip"
  );
  const createAccountLink = useAction(
    api.actions.cleanerStripeConnect.createCleanerStripeAccountLink
  );
  const getManualSignedUrl = useAction(api.actions.manuals.getManualSignedUrl);
  const completeOnboardingItem = useMutation((api as any).mutations.workers.completeMyOnboardingItem);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingManualId, setOpeningManualId] = useState<string | null>(null);
  const [completingItemId, setCompletingItemId] = useState<string | null>(null);
  const [completionError, setCompletionError] = useState<string | null>(null);

  const params = new URLSearchParams(window.location.search);
  const stripeParam = params.get("stripe");

  if (
    !user ||
    connectStatus === undefined ||
    workerProfile === undefined ||
    manuals === undefined ||
    companyDocuments === undefined ||
    payments === undefined ||
    (workerProfile?._id && (documents === undefined || onboardingItems === undefined))
  ) {
    return <PageLoader />;
  }

  const isConnected = !!connectStatus?.stripeConnectAccountId;
  const accountIdSuffix = connectStatus?.stripeConnectAccountId
    ? connectStatus.stripeConnectAccountId.slice(-6)
    : null;

  const handleConnect = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await createAccountLink({ userId: user._id, sessionToken: getStaffSessionToken() });
      if (result?.url) {
        window.location.href = result.url;
      }
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenManual = async (manualId: string) => {
    setOpeningManualId(manualId);
    try {
      const { url } = await getManualSignedUrl({ userId: user._id, manualId: manualId as any });
      window.open(url, "_blank");
    } catch {
      // Keep this card read-only; workers can still open Manuals from the main nav if a signed URL fails.
    } finally {
      setOpeningManualId(null);
    }
  };

  const handleOpenCompanyDocument = (document: any) => {
    if (document.url) {
      window.open(document.url, "_blank");
    }
  };

  const handleCompleteOnboardingItem = async (item: any) => {
    setCompletingItemId(item._id);
    setCompletionError(null);
    try {
      await completeOnboardingItem({
        userId: user._id,
        onboardingItemId: item._id,
      });
    } catch (e: any) {
      setCompletionError(e.message ?? "Could not complete this onboarding item.");
    } finally {
      setCompletingItemId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Worker Settings"
        description="Your profile, work preferences, onboarding, documents, payments, and account links."
      />

      {stripeParam === "return" && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          Stripe onboarding complete. You can receive payments for jobs.
        </div>
      )}
      {stripeParam === "refresh" && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-yellow-50 p-3 text-sm text-yellow-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          Stripe session expired. Start the connection again when you are ready.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ProfileBasicsSection user={user} workerProfile={workerProfile} />
        <WorkPreferencesSection user={user} workerProfile={workerProfile} />
        <div className="lg:col-span-2">
          <ComplianceHubSection
            workerProfile={workerProfile}
            documents={documents ?? []}
            companyDocuments={companyDocuments ?? []}
            onboardingItems={onboardingItems ?? []}
            manuals={manuals ?? []}
            completingItemId={completingItemId}
            completionError={completionError}
            onComplete={handleCompleteOnboardingItem}
            onOpenCompanyDocument={handleOpenCompanyDocument}
            onOpenManual={handleOpenManual}
            openingManualId={openingManualId}
          />
        </div>
        <PaymentsSection
          connectStatus={connectStatus}
          payments={payments ?? []}
          loading={loading}
          error={error}
          accountIdSuffix={accountIdSuffix}
          isConnected={isConnected}
          onConnect={handleConnect}
        />
        <AccountSection email={user.email} onSignOut={signOut} />
      </div>
    </div>
  );
}
