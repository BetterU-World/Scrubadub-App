import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ServiceAgreementCard } from "@/components/owner/ServiceAgreementCard";
import { WalkthroughCard } from "@/components/owner/WalkthroughCard";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { ServiceAgreementStatusBadge } from "@/components/ui/ServiceAgreementStatusBadge";
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
  Send,
  ClipboardCheck,
} from "lucide-react";
import { useTranslation } from "react-i18next";

function leadPipelineStorageKey(userId: string) {
  return `scrubadub.request-details.lead-pipeline.${userId}`;
}

function loadLeadPipelineExpanded(userId?: string) {
  if (!userId) return true;
  try {
    const saved = localStorage.getItem(leadPipelineStorageKey(userId));
    return saved === null ? true : saved === "true";
  } catch {
    return true;
  }
}

export function RequestDetailPage() {
  const { user, sessionToken } = useAuth();
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();

  const request = useQuery(
    api.queries.clientRequests.getRequestById,
    params.id && user && sessionToken
      ? { id: params.id as Id<"clientRequests">, userId: user._id, sessionToken }
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
  const updateLeadDetailsMut = useMutation(
    api.mutations.clientRequests.updateLeadDetails
  );
  const createClientRelationshipFromLead = useMutation(
    (api as any).mutations.clientRelationships.createFromClientRequest
  );
  const createProposal = useMutation(
    (api as any).mutations.proposals.createProposalFromLead
  );
  const updateProposalMut = useMutation((api as any).mutations.proposals.updateProposal);
  const markProposalSent = useMutation((api as any).mutations.proposals.markProposalSent);
  const markProposalAccepted = useMutation(
    (api as any).mutations.proposals.markProposalAccepted
  );
  const markProposalDeclined = useMutation(
    (api as any).mutations.proposals.markProposalDeclined
  );
  const sendProposalEmail = useAction(
    (api as any).proposalDeliveryActions.sendProposal
  );
  const createCommercialAccount = useMutation(
    (api as any).mutations.commercialAccounts.create
  );
  const updateCommercialAccount = useMutation(
    (api as any).mutations.commercialAccounts.update
  );

  const proposal = useQuery(
    (api as any).queries.proposals.getProposalByClientRequest,
    params.id && user && sessionToken
      ? {
          userId: user._id,
          sessionToken,
          clientRequestId: params.id as Id<"clientRequests">,
        }
      : "skip"
  );
  const serviceAgreement = useQuery(
    (api as any).queries.serviceAgreements.getByProposal,
    proposal?.status === "accepted" && user
      ? { userId: user._id, sessionToken, proposalId: proposal._id }
      : "skip"
  );
  const leadWalkthroughs = useQuery(
    (api as any).queries.walkthroughs.listByClientRequest,
    params.id && user ? { userId: user._id, sessionToken, clientRequestId: params.id as Id<"clientRequests"> } : "skip"
  );
  const activeWalkthrough = (leadWalkthroughs ?? []).find((item: any) => item.status !== "archived");
  const proposalUnlocked = activeWalkthrough?.status === "completed" || activeWalkthrough?.appointmentStatus === "completed";
  const commercialAccount = useQuery(
    (api as any).queries.commercialAccounts.getByProposal,
    proposal && user
      ? {
          userId: user._id,
          sessionToken,
          proposalId: proposal._id,
        }
      : "skip"
  );
  const commercialEligibility = useQuery(
    (api as any).queries.commercialAccounts.getEligibilityForRequest,
    params.id && user && sessionToken
      ? {
          userId: user._id,
          sessionToken,
          clientRequestId: params.id as Id<"clientRequests">,
        }
      : "skip"
  );
  const managers = useQuery(
    api.queries.employees.getManagers,
    proposal?.status === "accepted" && user?.companyId && sessionToken
      ? { companyId: user.companyId, userId: user._id, sessionToken }
      : "skip"
  );
  const cleaners = useQuery(
    api.queries.employees.getCleaners,
    proposal?.status === "accepted" && user?.companyId && sessionToken
      ? { companyId: user.companyId, userId: user._id, sessionToken }
      : "skip"
  );
  const teams = useQuery(
    api.queries.teams.listActiveForAssignment,
    proposal?.status === "accepted" && user?.companyId
      ? { companyId: user.companyId, userId: user._id, sessionToken }
      : "skip"
  );

  const latestFeedback = useQuery(
    api.queries.clientRequests.getLatestFeedbackForRequest,
    params.id && user && sessionToken
      ? {
          userId: user._id,
          sessionToken,
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
  const [leadPipelineExpanded, setLeadPipelineExpanded] = useState(() =>
    loadLeadPipelineExpanded(user?._id)
  );

  const handleLeadPipelineExpandedChange = (expanded: boolean) => {
    setLeadPipelineExpanded(expanded);
    if (!user) return;
    try {
      localStorage.setItem(leadPipelineStorageKey(user._id), String(expanded));
    } catch {
      // Browser storage may be unavailable or full; keep the in-memory preference.
    }
  };

  // Lead pipeline state
  const [leadNotesVal, setLeadNotesVal] = useState("");
  const [leadNotesLoaded, setLeadNotesLoaded] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [followUpVal, setFollowUpVal] = useState("");
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const [contactingLoading, setContactingLoading] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [savingLeadDetails, setSavingLeadDetails] = useState(false);
  const [creatingClientRelationship, setCreatingClientRelationship] = useState(false);
  const [leadTypeVal, setLeadTypeVal] = useState("booking_request");
  const [businessNameVal, setBusinessNameVal] = useState("");
  const [businessContactTitleVal, setBusinessContactTitleVal] = useState("");
  const [businessWebsiteVal, setBusinessWebsiteVal] = useState("");
  const [estimatedValueVal, setEstimatedValueVal] = useState("");
  const [estimatedFrequencyVal, setEstimatedFrequencyVal] = useState("");
  const [estimatedFrequencyNotesVal, setEstimatedFrequencyNotesVal] = useState("");

  // Proposal state
  const [creatingProposal, setCreatingProposal] = useState(false);
  const [savingProposal, setSavingProposal] = useState(false);
  const [proposalActionLoading, setProposalActionLoading] = useState<string | null>(null);
  const [editingProposal, setEditingProposal] = useState(false);
  const [proposalLoadedId, setProposalLoadedId] = useState<string | null>(null);
  const previousProposalStatus = useRef<string | null>(null);
  const [accountLoadedKey, setAccountLoadedKey] = useState<string | null>(null);
  const [proposalForm, setProposalForm] = useState({
    title: "",
    clientName: "",
    businessName: "",
    propertyAddress: "",
    serviceFrequency: "",
    serviceFrequencyNotes: "",
    scopeOfWork: "",
    monthlyPrice: "",
    oneTimePrice: "",
    notes: "",
  });
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountForm, setAccountForm] = useState({
    clientName: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    serviceAddress: "",
    contractAmount: "",
    serviceFrequency: "",
    startDate: "",
    renewalDate: "",
    assignedManagerId: "",
    assignedCleanerId: "",
    assignedTeamId: "",
    status: "active",
    notes: "",
  });

  // Sync lead notes / follow-up from server on first load
  useEffect(() => {
    if (request && !leadNotesLoaded) {
      setLeadNotesVal((request as any).leadNotes ?? "");
      setLeadTypeVal((request as any).leadType ?? "booking_request");
      setBusinessNameVal((request as any).businessName ?? "");
      setBusinessContactTitleVal((request as any).businessContactTitle ?? "");
      setBusinessWebsiteVal((request as any).businessWebsite ?? "");
      setEstimatedValueVal(
        (request as any).estimatedContractValueCents != null
          ? String((request as any).estimatedContractValueCents / 100)
          : ""
      );
      setEstimatedFrequencyVal((request as any).estimatedFrequency ?? "");
      setEstimatedFrequencyNotesVal((request as any).estimatedFrequencyNotes ?? "");
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

  useEffect(() => {
    if (proposal && proposal._id !== proposalLoadedId) {
      setProposalForm({
        title: proposal.title ?? "",
        clientName: proposal.clientName ?? "",
        businessName: proposal.businessName ?? "",
        propertyAddress: proposal.propertyAddress ?? "",
        serviceFrequency: proposal.serviceFrequency ?? "",
        serviceFrequencyNotes: proposal.serviceFrequencyNotes ?? "",
        scopeOfWork: proposal.scopeOfWork ?? "",
        monthlyPrice:
          proposal.monthlyPriceCents != null
            ? String(proposal.monthlyPriceCents / 100)
            : "",
        oneTimePrice:
          proposal.oneTimePriceCents != null
            ? String(proposal.oneTimePriceCents / 100)
            : "",
        notes: proposal.notes ?? "",
      });
      setEditingProposal(proposal.status === "draft");
      setProposalLoadedId(proposal._id);
    }
  }, [proposal, proposalLoadedId]);

  useEffect(() => {
    const currentStatus = proposal?.status ?? null;
    const respondedWhileEditing =
      previousProposalStatus.current === "sent" &&
      (currentStatus === "accepted" || currentStatus === "declined") &&
      editingProposal;

    if (respondedWhileEditing) {
      setEditingProposal(false);
      setToast({ message: t("proposals.respondedWhileEditing"), type: "success" });
      setTimeout(() => setToast(null), 4000);
    }
    previousProposalStatus.current = currentStatus;
  }, [proposal?.status, editingProposal, t]);

  useEffect(() => {
    if (!request || !proposal || proposal.status !== "accepted") return;
    const key = commercialAccount?._id ?? `proposal:${proposal._id}`;
    if (accountLoadedKey === key) return;
    if (commercialAccount) {
      setAccountForm({
        clientName: commercialAccount.clientName ?? "",
        contactName: commercialAccount.contactName ?? "",
        contactEmail: commercialAccount.contactEmail ?? "",
        contactPhone: commercialAccount.contactPhone ?? "",
        serviceAddress: commercialAccount.serviceAddress ?? "",
        contractAmount:
          commercialAccount.contractAmountCents != null
            ? String(commercialAccount.contractAmountCents / 100)
            : "",
        serviceFrequency: commercialAccount.serviceFrequency ?? "",
        startDate: commercialAccount.startDate ?? "",
        renewalDate: commercialAccount.renewalDate ?? "",
        assignedManagerId: commercialAccount.assignedManagerId ?? "",
        assignedCleanerId: commercialAccount.assignedCleanerId ?? "",
        assignedTeamId: commercialAccount.assignedTeamId ?? "",
        status: commercialAccount.status ?? "active",
        notes: commercialAccount.notes ?? "",
      });
      setAccountLoadedKey(key);
      return;
    }
    setAccountForm((current) => ({
      ...current,
      clientName: proposal.businessName || proposal.clientName || (request as any).businessName || request.requesterName,
      contactName: proposal.clientName || request.requesterName,
      contactEmail: request.requesterEmail ?? "",
      contactPhone: request.requesterPhone ?? "",
      serviceAddress: proposal.propertyAddress || request.propertySnapshot?.address || "",
      contractAmount:
        proposal.monthlyPriceCents != null
          ? String(proposal.monthlyPriceCents / 100)
          : proposal.oneTimePriceCents != null
            ? String(proposal.oneTimePriceCents / 100)
            : (request as any).estimatedContractValueCents != null
              ? String((request as any).estimatedContractValueCents / 100)
              : "",
      serviceFrequency: proposal.serviceFrequency || (request as any).estimatedFrequency || "",
      startDate: request.requestedDate ?? "",
      notes: proposal.notes || (request as any).leadNotes || request.notes || "",
    }));
    setAccountLoadedKey(key);
  }, [proposal, commercialAccount, request, accountLoadedKey]);

  if (
    request === undefined ||
    proposal === undefined ||
    commercialEligibility === undefined ||
    (proposal && commercialAccount === undefined)
  ) return <PageLoader />;
  if (request === null) {
    return (
      <div className="text-center py-12 text-gray-500">{t("requests.requestNotFound")}</div>
    );
  }

  const canAct = request.status === "new" || request.status === "accepted" || request.status === "contacted";
  const canMarkContacted = request.status === "new";
  const canArchive = request.status !== "archived";
  const handleMarkContacted = async () => {
    setContactingLoading(true);
    try {
      await updateStatus({
        requestId: request._id,
        userId: user!._id,
        sessionToken,
        status: "contacted",
      });
      setToast({ message: t("requests.markedAsContacted"), type: "success" });
      setTimeout(() => setToast(null), 3000);
    } catch (err: any) {
      setToast({ message: err.message || "Failed to update", type: "error" });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setContactingLoading(false);
    }
  };

  const handleArchive = async () => {
    setArchiving(true);
    try {
      await archiveRequest({
        requestId: request._id,
        userId: user!._id,
        sessionToken,
      });
      setToast({ message: t("requests.requestArchived"), type: "success" });
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
    setLocation(`/jobs/new?requestId=${encodeURIComponent(request._id)}`);
  };

  const handleCreateProperty = async () => {
    setCreatingProperty(true);
    try {
      await createProperty({ requestId: request._id, userId: user!._id, sessionToken });
      setToast({ message: t("requests.propertyCreated"), type: "success" });
      setTimeout(() => setToast(null), 3000);
    } catch (err: any) {
      setToast({
        message: err.message?.includes("Classify this request")
          ? t("commercialConversion.propertyClassificationRequiredError")
          : err.message || "Failed to create property",
        type: "error",
      });
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
        sessionToken,
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

  const centsFromPrice = (value: string) => {
    if (!value.trim()) return undefined;
    const cents = Math.round(Number(value) * 100);
    if (!Number.isFinite(cents) || cents < 0) {
      throw new Error(t("proposals.invalidPrice"));
    }
    return cents;
  };

  const formatPrice = (cents?: number) =>
    cents == null
      ? t("proposals.priceNotSet")
      : new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: "USD",
        }).format(cents / 100);

  const formatProposalAmount = (monthlyPriceCents?: number, oneTimePriceCents?: number) => {
    const parts: string[] = [];
    if (monthlyPriceCents != null) {
      parts.push(`${formatPrice(monthlyPriceCents)} ${t("proposals.perMonth")}`);
    }
    if (oneTimePriceCents != null) {
      parts.push(`${formatPrice(oneTimePriceCents)} ${t("proposals.oneTime")}`);
    }
    return parts.length ? parts.join(" + ") : t("proposals.priceNotSet");
  };

  const formatDate = (date?: string) =>
    date ? new Date(`${date}T00:00:00`).toLocaleDateString() : t("common.unassigned");

  const formatTimestamp = (timestamp?: number) =>
    timestamp ? new Date(timestamp).toLocaleString() : t("common.unassigned");

  const handleCreateProposal = async () => {
    setCreatingProposal(true);
    try {
      await createProposal({ userId: user!._id, sessionToken, clientRequestId: request._id });
      setToast({ message: t("proposals.created"), type: "success" });
      setTimeout(() => setToast(null), 2000);
    } catch (err: any) {
      setToast({ message: err.message || t("proposals.createFailed"), type: "error" });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setCreatingProposal(false);
    }
  };

  const handleCreateClientRelationship = async () => {
    setCreatingClientRelationship(true);
    try {
      await createClientRelationshipFromLead({
        sessionToken,
        userId: user!._id,
        clientRequestId: request._id,
      });
      setToast({ message: "Client relationship created", type: "success" });
      setTimeout(() => setToast(null), 2000);
    } catch (err: any) {
      setToast({ message: err.message || "Failed to create client relationship", type: "error" });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setCreatingClientRelationship(false);
    }
  };

  const handleSaveProposal = async () => {
    if (!proposal) return;
    setSavingProposal(true);
    try {
      await updateProposalMut({
        sessionToken,
        userId: user!._id,
        proposalId: proposal._id,
        title: proposalForm.title,
        clientName: proposalForm.clientName,
        businessName: proposalForm.businessName || undefined,
        propertyAddress: proposalForm.propertyAddress || undefined,
        serviceFrequency: (proposalForm.serviceFrequency || undefined) as any,
        serviceFrequencyNotes: proposalForm.serviceFrequencyNotes || undefined,
        scopeOfWork: proposalForm.scopeOfWork || undefined,
        monthlyPriceCents: centsFromPrice(proposalForm.monthlyPrice),
        oneTimePriceCents: centsFromPrice(proposalForm.oneTimePrice),
        notes: proposalForm.notes || undefined,
      });
      setEditingProposal(false);
      setToast({ message: t("proposals.saved"), type: "success" });
      setTimeout(() => setToast(null), 2000);
    } catch (err: any) {
      setToast({ message: err.message || t("proposals.saveFailed"), type: "error" });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSavingProposal(false);
    }
  };

  const handleProposalAction = async (action: "sent" | "accepted" | "declined") => {
    if (!proposal) return;
    setProposalActionLoading(action);
    try {
      if (action === "sent") {
        await markProposalSent({ userId: user!._id, sessionToken, proposalId: proposal._id });
      } else if (action === "accepted") {
        await markProposalAccepted({ userId: user!._id, sessionToken, proposalId: proposal._id });
      } else {
        await markProposalDeclined({ userId: user!._id, sessionToken, proposalId: proposal._id });
      }
      setToast({ message: t(`proposals.${action}Success`), type: "success" });
      setTimeout(() => setToast(null), 2000);
    } catch (err: any) {
      setToast({ message: err.message || t("proposals.actionFailed"), type: "error" });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setProposalActionLoading(null);
    }
  };

  const handleSendProposalEmail = async () => {
    if (!proposal) return;
    setProposalActionLoading("email");
    try {
      await sendProposalEmail({ userId: user!._id, sessionToken, proposalId: proposal._id });
      setToast({
        message:
          proposal.status === "sent"
            ? t("proposals.resentSuccess")
            : t("proposals.sendSuccess"),
        type: "success",
      });
      setTimeout(() => setToast(null), 2500);
    } catch (err: any) {
      setToast({
        message: err.message || t("proposals.sendFailed"),
        type: "error",
      });
      setTimeout(() => setToast(null), 3500);
    } finally {
      setProposalActionLoading(null);
    }
  };

  const handleSaveCommercialAccount = async () => {
    if (!proposal) return;
    setSavingAccount(true);
    try {
      const payload = {
        userId: user!._id,
        clientRelationshipId: ((request as any).clientRelationshipId || undefined) as any,
        clientName: accountForm.clientName,
        contactName: accountForm.contactName || undefined,
        contactEmail: accountForm.contactEmail || undefined,
        contactPhone: accountForm.contactPhone || undefined,
        serviceAddress: accountForm.serviceAddress || undefined,
        contractAmountCents: centsFromPrice(accountForm.contractAmount),
        serviceFrequency: (accountForm.serviceFrequency || undefined) as any,
        startDate: accountForm.startDate || undefined,
        renewalDate: accountForm.renewalDate || undefined,
        assignedManagerId: (accountForm.assignedManagerId || undefined) as any,
        assignedCleanerId: (accountForm.assignedCleanerId || undefined) as any,
        assignedTeamId: (accountForm.assignedTeamId || undefined) as any,
        status: accountForm.status as any,
        notes: accountForm.notes || undefined,
      };
      if (commercialAccount) {
        await updateCommercialAccount({
          sessionToken,
          ...payload,
          accountId: commercialAccount._id,
        });
      } else {
        await createCommercialAccount({
          sessionToken,
          ...payload,
          clientRequestId: request._id,
          sourceLeadId: request._id,
          sourceProposalId: proposal._id,
        });
      }
      setShowAccountForm(false);
      setToast({
        message: commercialAccount
          ? t("commercialAccounts.updated")
          : t("commercialAccounts.created"),
        type: "success",
      });
      setTimeout(() => setToast(null), 2000);
    } catch (err: any) {
      const message = err.message?.includes("Classify the request or linked property")
        ? t("commercialConversion.classificationRequiredError")
        : err.message?.includes("classified as commercial")
          ? t("commercialConversion.notCommercialError")
          : err.message || t("commercialAccounts.saveFailed");
      setToast({ message, type: "error" });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSavingAccount(false);
    }
  };

  const handleDecline = async () => {
    setDeclining(true);
    try {
      await updateStatus({
        requestId: request._id,
        userId: user!._id,
        sessionToken,
        status: "declined",
      });
      setShowDecline(false);
      setToast({ message: t("requests.requestDeclined"), type: "success" });
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
        description={t("guidance.owner.requestDetail")}
        back={{ href: "/requests", label: t("navigation.backToRequests") }}
        action={
          <div className="flex gap-2 flex-wrap">
            {canMarkContacted && (
              <button
                onClick={handleMarkContacted}
                disabled={contactingLoading}
                className="btn-secondary flex items-center gap-2"
              >
                <PhoneOutgoing className="w-4 h-4" /> {contactingLoading ? t("requests.contacting") : t("requests.markContacted")}
              </button>
            )}
            {canAct && (
              <>
                <button
                  onClick={handleConvert}
                  className="btn-primary flex items-center gap-2"
                >
                  <Briefcase className="w-4 h-4" /> {t("requests.convertToJob")}
                </button>
                <button
                  onClick={() => setShowDecline(true)}
                  className="btn-danger flex items-center gap-2"
                >
                  <XCircle className="w-4 h-4" /> {t("requests.decline")}
                </button>
              </>
            )}
            {canArchive && (
              <button
                onClick={handleArchive}
                disabled={archiving}
                className="btn-secondary flex items-center gap-2 text-gray-500"
              >
                <Archive className="w-4 h-4" /> {archiving ? t("requests.archiving") : t("requests.archive")}
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
            {t("requests.submitted")} {new Date(request.createdAt).toLocaleString()}
          </span>
          {(request as any).contactedAt && (
            <span className="text-xs text-gray-400">
              {t("requests.contacted")} {new Date((request as any).contactedAt).toLocaleString()}
            </span>
          )}
          {(request as any).archivedAt && (
            <span className="text-xs text-gray-400">
              {t("requests.archived")} {new Date((request as any).archivedAt).toLocaleString()}
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
            <p className="text-sm font-medium text-gray-700 mb-1">{t("common.notes")}</p>
            <p className="text-sm text-gray-600">{request.notes}</p>
          </div>
        )}

        {/* Property link section */}
        <div className="border-t pt-3">
          {request.propertyId ? (
            <p className="flex items-center gap-2 text-sm text-primary-700">
              <Check className="w-4 h-4" /> {t("requests.propertyLinked")}
            </p>
          ) : canAct && request.propertySnapshot?.address ? (
            <button
              onClick={handleCreateProperty}
              disabled={creatingProperty}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <Building2 className="w-4 h-4" />
              {creatingProperty ? t("requests.creating") : t("requests.createProperty")}
            </button>
          ) : null}
        </div>
      </div>

      <CollapsibleSection
        title={t("walkthroughs.title")}
        subtitle={t("guidance.owner.walkthrough")}
        defaultExpanded
        className="mt-4"
        contentClassName="-m-4 mt-0"
      >
        <WalkthroughCard
          clientRequestId={request._id}
          allowCreate
          onToast={(message, type) => {
            setToast({ message, type });
            setTimeout(() => setToast(null), type === "success" ? 2000 : 3000);
          }}
        />
      </CollapsibleSection>

      {/* Proposal */}
      <CollapsibleSection
        title={t("proposals.title")}
        subtitle={t("guidance.owner.proposal")}
        icon={<FileText className="h-4 w-4" />}
        badge={proposal ? <>
          <span className="badge bg-primary-50 text-primary-700 capitalize">{t(`proposals.statuses.${proposal.status}`)}</span>
          {proposal.status === "accepted" && serviceAgreement !== undefined && (
            <ServiceAgreementStatusBadge agreement={serviceAgreement} />
          )}
        </> : undefined}
        className="mt-4"
      >

        {!proposalUnlocked ? (
          <p className="rounded-md bg-gray-50 p-3 text-sm text-gray-600">
            Complete the walkthrough to begin building a proposal.
          </p>
        ) : !proposal ? (
          <button
            onClick={handleCreateProposal}
            disabled={creatingProposal}
            className="btn-primary flex items-center justify-center gap-2 text-sm w-full sm:w-auto"
          >
            <FileText className="w-4 h-4" />
            {creatingProposal ? t("requests.creating") : t("proposals.create")}
          </button>
        ) : editingProposal ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {t("proposals.proposalTitle")}
                </label>
                <input
                  className="input-field text-sm"
                  value={proposalForm.title}
                  onChange={(e) => setProposalForm({ ...proposalForm, title: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {t("proposals.clientName")}
                </label>
                <input
                  className="input-field text-sm"
                  value={proposalForm.clientName}
                  onChange={(e) => setProposalForm({ ...proposalForm, clientName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {t("requests.businessName")}
                </label>
                <input
                  className="input-field text-sm"
                  value={proposalForm.businessName}
                  onChange={(e) => setProposalForm({ ...proposalForm, businessName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {t("common.address")}
                </label>
                <input
                  className="input-field text-sm"
                  value={proposalForm.propertyAddress}
                  onChange={(e) => setProposalForm({ ...proposalForm, propertyAddress: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {t("proposals.serviceFrequency")}
                </label>
                <select
                  className="input-field text-sm"
                  value={proposalForm.serviceFrequency}
                  onChange={(e) => setProposalForm({ ...proposalForm, serviceFrequency: e.target.value })}
                >
                  <option value="">{t("common.select")}</option>
                  {(["one_time", "weekly", "biweekly", "monthly", "quarterly", "custom"] as const).map((freq) => (
                    <option key={freq} value={freq}>{t(`leadFrequencies.${freq}`)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {t("proposals.frequencyNotes")}
                </label>
                <input
                  className="input-field text-sm"
                  value={proposalForm.serviceFrequencyNotes}
                  onChange={(e) => setProposalForm({ ...proposalForm, serviceFrequencyNotes: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {t("proposals.monthlyPrice")}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input-field text-sm"
                  value={proposalForm.monthlyPrice}
                  onChange={(e) => setProposalForm({ ...proposalForm, monthlyPrice: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {t("proposals.oneTimePrice")}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input-field text-sm"
                  value={proposalForm.oneTimePrice}
                  onChange={(e) => setProposalForm({ ...proposalForm, oneTimePrice: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("proposals.scopeOfWork")}
              </label>
              <textarea
                className="input-field text-sm"
                rows={4}
                value={proposalForm.scopeOfWork}
                onChange={(e) => setProposalForm({ ...proposalForm, scopeOfWork: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("common.notes")}
              </label>
              <textarea
                className="input-field text-sm"
                rows={3}
                value={proposalForm.notes}
                onChange={(e) => setProposalForm({ ...proposalForm, notes: e.target.value })}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={handleSaveProposal}
                disabled={savingProposal}
                className="btn-primary flex items-center gap-2 text-sm"
              >
                <Save className="w-4 h-4" />
                {savingProposal ? t("common.saving") : t("proposals.save")}
              </button>
              <button
                onClick={() => setEditingProposal(false)}
                className="btn-secondary text-sm"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border border-gray-200 bg-gray-50 p-4 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase text-gray-500">
                    {t("proposals.reviewProposal")}
                  </p>
                  <h4 className="mt-1 text-base font-semibold text-gray-900">
                    {proposal.title || t("proposals.title")}
                  </h4>
                  <p className="mt-1 text-sm text-gray-600">{proposal.clientName}</p>
                  {(proposal as any).clientRelationship && (
                    <p className="mt-2 inline-flex rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">
                      Client relationship: {(proposal as any).clientRelationship.displayName}
                    </p>
                  )}
                </div>
                <span className="badge bg-white text-gray-700 capitalize self-start">
                  {t(`proposals.statuses.${proposal.status}`)}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                {proposal.businessName && (
                  <div>
                    <p className="text-xs font-medium text-gray-500">{t("requests.businessName")}</p>
                    <p className="text-gray-900">{proposal.businessName}</p>
                  </div>
                )}
                {proposal.propertyAddress && (
                  <div>
                    <p className="text-xs font-medium text-gray-500">{t("common.address")}</p>
                    <p className="text-gray-900">{proposal.propertyAddress}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium text-gray-500">{t("proposals.estimatedContractAmount")}</p>
                  <p className="text-gray-900">
                    {formatProposalAmount(proposal.monthlyPriceCents, proposal.oneTimePriceCents)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">{t("proposals.serviceFrequency")}</p>
                  <p className="text-gray-900">
                    {proposal.serviceFrequency ? t(`leadFrequencies.${proposal.serviceFrequency}`) : t("common.unassigned")}
                  </p>
                  {proposal.serviceFrequencyNotes && (
                    <p className="mt-1 text-xs text-gray-500">{proposal.serviceFrequencyNotes}</p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">{t("proposals.terms")}</p>
                  <p className="text-gray-900">{t("proposals.termsNotSet")}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">{t("proposals.status")}</p>
                  <p className="text-gray-900">{t(`proposals.statuses.${proposal.status}`)}</p>
                </div>
                {proposal.sentAt && (
                  <div>
                    <p className="text-xs font-medium text-gray-500">{t("proposals.sentAt")}</p>
                    <p className="text-gray-900">{formatTimestamp(proposal.sentAt)}</p>
                  </div>
                )}
                {proposal.acceptedAt && (
                  <div>
                    <p className="text-xs font-medium text-gray-500">{t("proposals.acceptedOn")}</p>
                    <p className="text-gray-900">{formatTimestamp(proposal.acceptedAt)}</p>
                  </div>
                )}
              </div>
            </div>
            {proposal.status === "accepted" && proposal.proposalResponseNote && (
              <div className="rounded-md border border-green-200 bg-green-50 p-3">
                <p className="text-xs font-semibold uppercase text-green-800">
                  {t("proposals.clientResponse")}
                </p>
                <p className="mt-1 text-xs text-green-700">
                  {t("proposals.clientResponseHelper")}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-green-900">
                  {proposal.proposalResponseNote}
                </p>
              </div>
            )}
            {proposal.status === "accepted" && (
              <div className="space-y-3">
                <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm font-medium text-green-800 flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  {t("proposals.acceptedBanner")}
                </div>
                <p className="text-sm text-gray-500">
                  {t("guidance.owner.serviceAgreement")}
                </p>
                <ServiceAgreementCard
                  proposalId={proposal._id}
                  canCreate
                  source={{
                    title: `${proposal.businessName || proposal.clientName} ${t("serviceAgreements.title")}`,
                    clientName:
                      proposal.businessName ||
                      (request as any).clientRelationship?.businessName ||
                      (request as any).clientRelationship?.displayName ||
                      proposal.clientName ||
                      request.requesterName,
                    propertyAddress: proposal.propertyAddress || request.propertySnapshot?.address || "",
                    servicesIncluded:
                      proposal.scopeOfWork || request.requestedService || request.notes || "",
                    priceSummary: formatProposalAmount(
                      proposal.monthlyPriceCents,
                      proposal.oneTimePriceCents
                    ),
                    billingSchedule:
                      proposal.monthlyPriceCents != null
                        ? "Monthly"
                        : proposal.oneTimePriceCents != null
                          ? "One-time"
                          : "",
                    specialInstructions: proposal.notes || (request as any).leadNotes || request.notes || "",
                    exceptions: "None specified",
                    serviceFrequency: proposal.serviceFrequency,
                    contractAmountCents: proposal.monthlyPriceCents ?? proposal.oneTimePriceCents,
                    effectiveStartDate: request.requestedDate ?? "",
                    renewalDate: accountForm.renewalDate,
                    scopeOfWork: proposal.scopeOfWork,
                    notes: proposal.notes,
                  }}
                  onToast={(message, type) => {
                    setToast({ message, type });
                    setTimeout(() => setToast(null), type === "success" ? 2000 : 3000);
                  }}
                />
                {commercialAccount && !showAccountForm ? (
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-4 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium uppercase text-gray-500">
                          {t("commercialAccounts.summary")}
                        </p>
                        <h4 className="mt-1 text-base font-semibold text-gray-900">
                          {commercialAccount.clientName}
                        </h4>
                        {commercialAccount.clientRelationship && (
                          <p className="mt-2 inline-flex rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">
                            Client relationship: {commercialAccount.clientRelationship.displayName}
                          </p>
                        )}
                      </div>
                      <span className="badge bg-white text-gray-700 capitalize self-start">
                        {t(`commercialAccounts.statuses.${commercialAccount.status}`)}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs font-medium text-gray-500">
                          {t("commercialAccounts.contractAmount")}
                        </p>
                        <p className="text-gray-900">
                          {formatPrice(commercialAccount.contractAmountCents)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-500">
                          {t("commercialAccounts.frequency")}
                        </p>
                        <p className="text-gray-900">
                          {commercialAccount.serviceFrequency
                            ? t(`leadFrequencies.${commercialAccount.serviceFrequency}`)
                            : t("common.unassigned")}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-500">
                          {t("commercialAccounts.startDate")}
                        </p>
                        <p className="text-gray-900">{formatDate(commercialAccount.startDate)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-500">
                          {t("commercialAccounts.renewalDate")}
                        </p>
                        <p className="text-gray-900">{formatDate(commercialAccount.renewalDate)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-500">
                          {t("commercialAccounts.assignedManager")}
                        </p>
                        <p className="text-gray-900">
                          {commercialAccount.assignedManagerName ?? t("common.unassigned")}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-500">
                          {t("commercialAccounts.assignedCleaner")}
                        </p>
                        <p className="text-gray-900">
                          {commercialAccount.assignedCleanerName ?? t("common.unassigned")}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-500">
                          {t("commercialAccounts.assignedTeam")}
                        </p>
                        <p className="text-gray-900">
                          {commercialAccount.assignedTeamName ?? t("common.unassigned")}
                        </p>
                      </div>
                    </div>
                    {commercialAccount.notes && (
                      <div className="border-t pt-3">
                        <p className="text-xs font-medium text-gray-500 mb-1">
                          {t("common.notes")}
                        </p>
                        <p className="text-sm text-gray-600 whitespace-pre-wrap">
                          {commercialAccount.notes}
                        </p>
                      </div>
                    )}
                    <button
                      onClick={() => setShowAccountForm(true)}
                      className="btn-secondary text-sm"
                    >
                      {t("commercialAccounts.edit")}
                    </button>
                  </div>
                ) : (commercialAccount || commercialEligibility.eligible) && showAccountForm ? (
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-4 space-y-4">
                    <div className="flex items-center gap-2">
                      <ClipboardCheck className="w-4 h-4 text-gray-500" />
                      <div>
                        <p className="text-xs font-medium uppercase text-gray-500">
                          {t("proposals.nextStep")}
                        </p>
                        <h4 className="text-sm font-semibold text-gray-900">
                          {t("commercialAccounts.create")}
                        </h4>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          {t("commercialAccounts.clientName")}
                        </label>
                        <input
                          className="input-field text-sm"
                          value={accountForm.clientName}
                          onChange={(e) => setAccountForm({ ...accountForm, clientName: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          {t("commercialAccounts.contactName")}
                        </label>
                        <input
                          className="input-field text-sm"
                          value={accountForm.contactName}
                          onChange={(e) => setAccountForm({ ...accountForm, contactName: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          {t("common.email")}
                        </label>
                        <input
                          className="input-field text-sm"
                          value={accountForm.contactEmail}
                          onChange={(e) => setAccountForm({ ...accountForm, contactEmail: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          {t("common.phone")}
                        </label>
                        <input
                          className="input-field text-sm"
                          value={accountForm.contactPhone}
                          onChange={(e) => setAccountForm({ ...accountForm, contactPhone: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          {t("commercialAccounts.serviceAddress")}
                        </label>
                        <input
                          className="input-field text-sm"
                          value={accountForm.serviceAddress}
                          onChange={(e) => setAccountForm({ ...accountForm, serviceAddress: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          {t("commercialAccounts.contractAmount")}
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="input-field text-sm"
                          value={accountForm.contractAmount}
                          onChange={(e) => setAccountForm({ ...accountForm, contractAmount: e.target.value })}
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          {t("commercialAccounts.frequency")}
                        </label>
                        <select
                          className="input-field text-sm"
                          value={accountForm.serviceFrequency}
                          onChange={(e) => setAccountForm({ ...accountForm, serviceFrequency: e.target.value })}
                        >
                          <option value="">{t("common.select")}</option>
                          {(["one_time", "weekly", "biweekly", "monthly", "quarterly", "custom"] as const).map((freq) => (
                            <option key={freq} value={freq}>{t(`leadFrequencies.${freq}`)}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          {t("commercialAccounts.status")}
                        </label>
                        <select
                          className="input-field text-sm"
                          value={accountForm.status}
                          onChange={(e) => setAccountForm({ ...accountForm, status: e.target.value })}
                        >
                          {(["active", "paused", "ended"] as const).map((status) => (
                            <option key={status} value={status}>
                              {t(`commercialAccounts.statuses.${status}`)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          {t("commercialAccounts.startDate")}
                        </label>
                        <input
                          type="date"
                          className="input-field text-sm"
                          value={accountForm.startDate}
                          onChange={(e) => setAccountForm({ ...accountForm, startDate: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          {t("commercialAccounts.renewalDate")}
                        </label>
                        <input
                          type="date"
                          className="input-field text-sm"
                          value={accountForm.renewalDate}
                          onChange={(e) => setAccountForm({ ...accountForm, renewalDate: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          {t("commercialAccounts.assignedManager")}
                        </label>
                        <select
                          className="input-field text-sm"
                          value={accountForm.assignedManagerId}
                          onChange={(e) => setAccountForm({ ...accountForm, assignedManagerId: e.target.value })}
                        >
                          <option value="">{t("common.unassigned")}</option>
                          {(managers ?? []).map((manager: any) => (
                            <option key={manager._id} value={manager._id}>{manager.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          {t("commercialAccounts.assignedCleaner")}
                        </label>
                        <select
                          className="input-field text-sm"
                          value={accountForm.assignedCleanerId}
                          onChange={(e) => setAccountForm({ ...accountForm, assignedCleanerId: e.target.value })}
                        >
                          <option value="">{t("common.unassigned")}</option>
                          {(cleaners ?? []).map((cleaner: any) => (
                            <option key={cleaner._id} value={cleaner._id}>{cleaner.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          {t("commercialAccounts.assignedTeam")}
                        </label>
                        <select
                          className="input-field text-sm"
                          value={accountForm.assignedTeamId}
                          onChange={(e) => setAccountForm({ ...accountForm, assignedTeamId: e.target.value })}
                        >
                          <option value="">{t("common.unassigned")}</option>
                          {(teams ?? []).map((team: any) => (
                            <option key={team._id} value={team._id}>{team.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        {t("common.notes")}
                      </label>
                      <textarea
                        className="input-field text-sm"
                        rows={3}
                        value={accountForm.notes}
                        onChange={(e) => setAccountForm({ ...accountForm, notes: e.target.value })}
                      />
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={handleSaveCommercialAccount}
                        disabled={savingAccount}
                        className="btn-primary flex items-center gap-2 text-sm"
                      >
                        <Save className="w-4 h-4" />
                        {savingAccount ? t("common.saving") : t("commercialAccounts.save")}
                      </button>
                      <button
                        onClick={() => setShowAccountForm(false)}
                        className="btn-secondary text-sm"
                      >
                        {t("common.cancel")}
                      </button>
                    </div>
                  </div>
                ) : commercialEligibility.eligible ? (
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
                    <p className="text-xs font-medium uppercase text-gray-500">{t("proposals.nextStep")}</p>
                    <p className="mt-1 text-sm font-semibold text-gray-900">
                      {t("commercialConversion.commercialNextStep")}
                    </p>
                    <p className="mt-1 text-sm text-gray-600">
                      {t("commercialConversion.commercialNextStepDescription")}
                    </p>
                    <button
                      onClick={() => setShowAccountForm(true)}
                      className="btn-primary mt-3 flex items-center gap-2 text-sm"
                    >
                      <ClipboardCheck className="w-4 h-4" />
                      {t("commercialAccounts.create")}
                    </button>
                  </div>
                ) : commercialEligibility.reason === "classification_required" ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
                    <p className="text-xs font-medium uppercase text-amber-700">{t("proposals.nextStep")}</p>
                    <p className="mt-1 text-sm font-semibold text-amber-900">
                      {t("commercialConversion.classificationRequired")}
                    </p>
                    <p className="mt-1 text-sm text-amber-800">
                      {commercialEligibility.source === "property"
                        ? t("commercialConversion.classifyPropertyDescription")
                        : t("commercialConversion.classifyRequestDescription")}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        if (commercialEligibility.propertyId) {
                          setLocation(`/properties/${commercialEligibility.propertyId}`);
                        } else {
                          document.getElementById("request-lead-classification")?.scrollIntoView({ behavior: "smooth" });
                        }
                      }}
                      className="btn-secondary mt-3 text-sm"
                    >
                      {commercialEligibility.propertyId
                        ? t("commercialConversion.reviewProperty")
                        : t("commercialConversion.classifyRequest")}
                    </button>
                  </div>
                ) : (
                  <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
                    <p className="text-xs font-medium uppercase text-blue-700">{t("proposals.nextStep")}</p>
                    <p className="mt-1 text-sm font-semibold text-blue-900">
                      {t("commercialConversion.residentialNextStep")}
                    </p>
                    <p className="mt-1 text-sm text-blue-800">
                      {t("commercialConversion.residentialNextStepDescription")}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {!request.propertyId &&
                        request.propertySnapshot?.address &&
                        commercialEligibility.mappedPropertyType && (
                        <button
                          type="button"
                          onClick={handleCreateProperty}
                          disabled={creatingProperty}
                          className="btn-secondary text-sm"
                        >
                          {creatingProperty ? t("requests.creating") : t("requests.createProperty")}
                        </button>
                      )}
                      <button type="button" onClick={handleConvert} className="btn-primary text-sm">
                        {t("commercialConversion.scheduleService")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {proposal.scopeOfWork && (
              <div className="border-t pt-3">
                <p className="text-xs font-medium text-gray-500 mb-1">{t("proposals.scopeOfWork")}</p>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{proposal.scopeOfWork}</p>
              </div>
            )}
            {proposal.notes && (
              <div className="border-t pt-3">
                <p className="text-xs font-medium text-gray-500 mb-1">{t("common.notes")}</p>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{proposal.notes}</p>
              </div>
            )}
            {proposal.status === "declined" && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800 flex items-center gap-2">
                <XCircle className="w-4 h-4" />
                {t("proposals.declinedBanner")}
              </div>
            )}
            {(proposal.status === "draft" || proposal.status === "sent") && (
              <div className="rounded-md border border-primary-100 bg-primary-50 p-3 text-sm text-primary-800">
                <p className="font-medium">{t("proposals.nextStep")}</p>
                <p className="mt-1">
                  {proposal.status === "draft"
                    ? t("proposals.nextStepDraft")
                    : t("proposals.nextStepSent")}
                </p>
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              {(proposal.status === "draft" || proposal.status === "sent") && (
                <button
                  onClick={() => setEditingProposal(true)}
                  className="btn-secondary text-sm"
                >
                  {t("proposals.editProposal")}
                </button>
              )}
              {proposal.status === "draft" && (
                <>
                  <button
                    onClick={handleSendProposalEmail}
                    disabled={proposalActionLoading === "email"}
                    className="btn-primary flex items-center gap-2 text-sm"
                  >
                    <Send className="w-4 h-4" />
                    {proposalActionLoading === "email" ? t("common.saving") : t("proposals.sendProposal")}
                  </button>
                  <button
                    onClick={() => handleProposalAction("sent")}
                    disabled={proposalActionLoading === "sent"}
                    className="btn-secondary flex items-center gap-2 text-sm"
                  >
                    <Send className="w-4 h-4" />
                    {proposalActionLoading === "sent" ? t("common.saving") : t("proposals.markSentWithoutEmail")}
                  </button>
                </>
              )}
              {proposal.status === "sent" && (
                <>
                  <button
                    onClick={handleSendProposalEmail}
                    disabled={proposalActionLoading === "email"}
                    className="btn-secondary flex items-center gap-2 text-sm"
                  >
                    <Send className="w-4 h-4" />
                    {proposalActionLoading === "email" ? t("common.saving") : t("proposals.resendProposal")}
                  </button>
                  <button
                    onClick={() => handleProposalAction("accepted")}
                    disabled={proposalActionLoading === "accepted"}
                    className="btn-primary flex items-center gap-2 text-sm"
                  >
                    <Check className="w-4 h-4" />
                    {proposalActionLoading === "accepted" ? t("common.saving") : t("proposals.markAcceptedOutside")}
                  </button>
                  <button
                    onClick={() => handleProposalAction("declined")}
                    disabled={proposalActionLoading === "declined"}
                    className="btn-danger flex items-center gap-2 text-sm"
                  >
                    <XCircle className="w-4 h-4" />
                    {proposalActionLoading === "declined" ? t("common.saving") : t("proposals.markDeclinedOutside")}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* Client relationship */}
      <div className="card mt-4 space-y-3">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">
            Client relationship
          </h3>
        </div>
        {(request as any).clientRelationship ? (
          <div className="inline-flex w-fit rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">
            {(request as any).clientRelationship.displayName}
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500">
              Create a company-scoped client relationship from this lead. This does not create a client login.
            </p>
            <button
              onClick={handleCreateClientRelationship}
              disabled={creatingClientRelationship}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <Link2 className="w-4 h-4" />
              {creatingClientRelationship ? "Creating..." : "Create Client Relationship"}
            </button>
          </>
        )}
      </div>

      {/* Lead Pipeline controls */}
      <CollapsibleSection
        title={t("requests.leadPipeline")}
        subtitle={t("requests.leadPipelineHelper")}
        expanded={leadPipelineExpanded}
        onExpandedChange={handleLeadPipelineExpandedChange}
        className="mt-4"
      >

        {/* Stage selector */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700">
            {t("requests.currentStage", {
              stage: t(`requests.leadStages.${(request as any).leadStage ?? "new"}`, {
                defaultValue: t("requests.leadStages.unknown"),
              }),
            })}
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("requests.leadStage")}>
            {([
              "new",
              "contacted",
              "walkthrough_scheduled",
              "proposal_needed",
              "proposal_sent",
              "negotiating",
              "accepted",
              "declined",
              "converted",
            ] as const).map(
              (stage) => {
                const current = (request as any).leadStage ?? "new";
                const isActive = current === stage;
                return (
                  <button
                    key={stage}
                    onClick={async () => {
                      try {
                        const stageLabel = t(`requests.leadStages.${stage}`);
                        await updateLeadStage({
                          userId: user!._id,
                          sessionToken,
                          requestId: request._id,
                          leadStage: stage,
                        });
                        setToast({ message: t("requests.stageUpdated", { stage: stageLabel }), type: "success" });
                        setTimeout(() => setToast(null), 2000);
                      } catch (err: any) {
                        setToast({ message: err.message || "Failed", type: "error" });
                        setTimeout(() => setToast(null), 3000);
                      }
                    }}
                    aria-pressed={isActive}
                    className={`min-h-9 rounded-full border px-3 py-2 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 ${
                      isActive
                        ? "border-primary-600 bg-primary-600 text-white shadow-sm"
                        : "border-gray-300 bg-white text-gray-700 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
                    }`}
                  >
                    {t(`requests.leadStages.${stage}`)}
                  </button>
                );
              }
            )}
          </div>
        </div>


        {/* Lead Details */}
        <div id="request-lead-classification" className="border-t pt-4 space-y-3 scroll-mt-24">
          <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
            {t("requests.leadDetails")}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("requests.leadType")}
              </label>
              <select
                className="input-field text-sm"
                value={leadTypeVal}
                onChange={(e) => setLeadTypeVal(e.target.value)}
              >
                {([
                  "booking_request",
                  "residential",
                  "str_airbnb",
                  "commercial",
                  "move_out",
                  "post_construction",
                  "other",
                ] as const).map((type) => (
                  <option key={type} value={type}>
                    {t(`leadTypes.${type}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("requests.businessName")}
              </label>
              <input
                className="input-field text-sm"
                value={businessNameVal}
                onChange={(e) => setBusinessNameVal(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("requests.businessContactTitle")}
              </label>
              <input
                className="input-field text-sm"
                value={businessContactTitleVal}
                onChange={(e) => setBusinessContactTitleVal(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("requests.businessWebsite")}
              </label>
              <input
                className="input-field text-sm"
                value={businessWebsiteVal}
                onChange={(e) => setBusinessWebsiteVal(e.target.value)}
                placeholder="https://"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("requests.estimatedContractValue")}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input-field text-sm"
                value={estimatedValueVal}
                onChange={(e) => setEstimatedValueVal(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("requests.estimatedFrequency")}
              </label>
              <select
                className="input-field text-sm"
                value={estimatedFrequencyVal}
                onChange={(e) => setEstimatedFrequencyVal(e.target.value)}
              >
                <option value="">{t("common.select")}</option>
                {(["one_time", "weekly", "biweekly", "monthly", "quarterly", "custom"] as const).map((freq) => (
                  <option key={freq} value={freq}>
                    {t(`leadFrequencies.${freq}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {t("requests.estimatedFrequencyNotes")}
            </label>
            <input
              className="input-field text-sm"
              value={estimatedFrequencyNotesVal}
              onChange={(e) => setEstimatedFrequencyNotesVal(e.target.value)}
            />
          </div>
          <button
            disabled={savingLeadDetails}
            onClick={async () => {
              setSavingLeadDetails(true);
              try {
                const cents = estimatedValueVal
                  ? Math.round(Number(estimatedValueVal) * 100)
                  : undefined;
                if (
                  estimatedValueVal &&
                  (cents === undefined || !Number.isFinite(cents) || cents < 0)
                ) {
                  throw new Error(t("requests.invalidEstimate"));
                }
                await updateLeadDetailsMut({
                  userId: user!._id,
                  sessionToken,
                  requestId: request._id,
                  leadType: leadTypeVal as any,
                  businessName: businessNameVal,
                  businessContactTitle: businessContactTitleVal,
                  businessWebsite: businessWebsiteVal,
                  estimatedContractValueCents: cents,
                  estimatedFrequency: (estimatedFrequencyVal || undefined) as any,
                  estimatedFrequencyNotes: estimatedFrequencyNotesVal,
                });
                setToast({ message: t("requests.leadDetailsSaved"), type: "success" });
                setTimeout(() => setToast(null), 2000);
              } catch (err: any) {
                setToast({ message: err.message || "Failed", type: "error" });
                setTimeout(() => setToast(null), 3000);
              } finally {
                setSavingLeadDetails(false);
              }
            }}
            className="btn-secondary flex items-center gap-1.5 text-xs py-1 px-2.5"
          >
            <Save className="w-3 h-3" />
            {savingLeadDetails ? t("common.saving") : t("requests.saveLeadDetails")}
          </button>
        </div>

        {/* Lead Notes */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {t("requests.leadNotesInternal")}
          </label>
          <textarea
            className="input-field text-sm"
            rows={3}
            maxLength={4000}
            placeholder={t("requests.leadNotesPlaceholder")}
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
                    sessionToken,
                    requestId: request._id,
                    leadNotes: leadNotesVal,
                  });
                  setToast({ message: t("requests.notesSaved"), type: "success" });
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
              {savingNotes ? t("common.saving") : t("requests.saveNotes")}
            </button>
            <span className="text-xs text-gray-400">
              {leadNotesVal.length}/4000
            </span>
          </div>
        </div>

        {/* Next Follow-up */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {t("requests.nextFollowUp")}
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
                    sessionToken,
                    requestId: request._id,
                    nextFollowUpAt: ts,
                  });
                  setToast({
                    message: ts ? t("requests.followUpSet") : t("requests.followUpCleared"),
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
              {savingFollowUp ? "..." : t("common.save")}
            </button>
            {followUpVal && (
              <button
                onClick={async () => {
                  setFollowUpVal("");
                  setSavingFollowUp(true);
                  try {
                    await updateNextFollowUpMut({
                      userId: user!._id,
                      sessionToken,
                      requestId: request._id,
                      nextFollowUpAt: undefined,
                    });
                    setToast({ message: t("requests.followUpCleared"), type: "success" });
                    setTimeout(() => setToast(null), 2000);
                  } catch (err: any) {
                    setToast({ message: err.message || "Failed", type: "error" });
                    setTimeout(() => setToast(null), 3000);
                  } finally {
                    setSavingFollowUp(false);
                  }
                }}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                title={t("requests.clearFollowUp")}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {(request as any).nextFollowUpAt && (request as any).nextFollowUpAt <= Date.now() && (
            <p className="flex items-center gap-1 text-xs text-red-600 mt-1">
              <AlertCircle className="w-3 h-3" /> {t("requests.overdue")}
            </p>
          )}
        </div>
      </CollapsibleSection>

      {/* Client Feedback link */}
      <div className="card mt-4 space-y-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">
            {t("requests.clientFeedbackLink")}
          </h3>
        </div>
        <p className="text-sm text-gray-500">
          {t("requests.clientFeedbackLinkDesc")}
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
              {copiedPortal ? t("requests.copied") : t("requests.copyLink")}
            </button>
          </div>
        ) : (
          <button
            onClick={handleGeneratePortalLink}
            disabled={generatingPortal}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <MessageSquare className="w-4 h-4" />
            {generatingPortal ? t("requests.generating") : t("requests.generateFeedbackLink")}
          </button>
        )}
      </div>

      {/* Client notes (if any) */}
      {request.clientNotes && (
        <div className="card mt-4 space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">
            {t("requests.clientNotes")}
          </h3>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">
            {request.clientNotes}
          </p>
          {request.updatedByClientAt && (
            <p className="text-xs text-gray-400">
              {t("requests.updatedByClient")}{" "}
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
              {t("requests.clientFeedback")}
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

      {/* Decline dialog */}
      <ConfirmDialog
        open={showDecline}
        onOpenChange={setShowDecline}
        title={t("requests.declineRequest")}
        description={t("requests.declineConfirm", { name: request.requesterName })}
        confirmLabel={t("requests.decline")}
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
