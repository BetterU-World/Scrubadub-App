export type LeadPipelineStage =
  | "new"
  | "qualification"
  | "walkthrough"
  | "proposal"
  | "decision"
  | "agreement"
  | "onboarding"
  | "converted"
  | "closed";

export type LeadAttention = "overdue" | "blocked" | "stale" | "active" | "none";

type PipelineRecord = {
  _id?: unknown;
  proposalId?: unknown;
  status: string;
  signedAt?: number;
  sentAt?: number;
  acknowledgedAt?: number;
  clientRespondedAt?: number;
  declinedAt?: number;
  updatedAt?: number;
  createdAt?: number;
  appointmentStatus?: "draft" | "scheduled" | "completed" | "cancelled";
  scheduledDate?: string;
  scheduledStartTime?: string;
};

export function acceptedProposalAgreementAction(
  agreement: PipelineRecord | undefined,
  hasCommercialAccount: boolean,
  clientPortalActive: boolean,
) {
  const hrefSuffix = "#request-agreement";
  if (!agreement) return { key: "create_agreement", hrefSuffix };
  if (agreement.declinedAt != null) return { key: "review_declined_agreement", hrefSuffix };
  if (agreement.status === "cancelled") return { key: "review_cancelled_agreement", hrefSuffix };
  if (agreement.signedAt != null) return {
    key: hasCommercialAccount ? "review_commercial_account" : "signed_received_continue_setup",
    hrefSuffix,
  };
  if (agreement.acknowledgedAt != null || agreement.clientRespondedAt != null || agreement.status === "signed") return {
    key: hasCommercialAccount ? "review_commercial_account" : "acknowledged_continue_setup",
    hrefSuffix,
  };
  if (agreement.status === "sent") return {
    key: clientPortalActive ? "await_client_acknowledgment" : "enable_client_access",
    hrefSuffix: clientPortalActive ? hrefSuffix : "#request-client-portal",
  };
  if (agreement.status === "ready") return { key: "issue_agreement", hrefSuffix };
  return { key: "review_agreement", hrefSuffix };
}

export type LeadPipelineInput = {
  request: {
    status: string;
    leadStage?: string;
    leadType?: string;
    requesterEmail?: string;
    requesterPhone?: string;
    createdAt: number;
    contactedAt?: number;
    archivedAt?: number;
    lastStageChangedAt?: number;
    updatedByClientAt?: number;
    nextFollowUpAt?: number;
    propertyId?: unknown;
    clientRelationshipId?: unknown;
  };
  walkthroughs: PipelineRecord[];
  proposals: PipelineRecord[];
  agreements: PipelineRecord[];
  commercialAccounts: PipelineRecord[];
  clientPortalStatus: "not_invited" | "pending" | "active";
  now?: number;
};

const DAY = 24 * 60 * 60 * 1000;
export const LEAD_STALE_AFTER_MS = 7 * DAY;

function newest<T extends PipelineRecord>(records: T[]) {
  return [...records].sort(
    (a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0)
  )[0];
}

function lastActivity(input: LeadPipelineInput) {
  const request = input.request;
  return Math.max(
    request.createdAt,
    request.contactedAt ?? 0,
    request.archivedAt ?? 0,
    request.lastStageChangedAt ?? 0,
    request.updatedByClientAt ?? 0,
    ...input.walkthroughs.map((record) => record.updatedAt ?? record.createdAt ?? 0),
    ...input.proposals.map((record) => record.updatedAt ?? record.createdAt ?? 0),
    ...input.agreements.map((record) => record.updatedAt ?? record.createdAt ?? 0),
    ...input.commercialAccounts.map((record) => record.updatedAt ?? record.createdAt ?? 0)
  );
}

export function deriveLeadPipelineState(input: LeadPipelineInput) {
  const now = input.now ?? Date.now();
  const { request } = input;
  const latestWalkthrough = newest(input.walkthroughs.filter((record) => record.status !== "archived"));
  const walkthroughIsScheduled = latestWalkthrough?.appointmentStatus === "scheduled" ||
    latestWalkthrough?.appointmentStatus === "completed" ||
    (latestWalkthrough?.appointmentStatus === undefined && Boolean(latestWalkthrough?.scheduledDate && latestWalkthrough?.scheduledStartTime));
  const latestProposal = newest(input.proposals);
  const latestAgreement = newest(input.agreements.filter((agreement) =>
    !latestProposal?._id || agreement.proposalId === latestProposal._id));
  const activeAccount = input.commercialAccounts.find((record) => record.status !== "ended");
  const isClosed =
    request.status === "declined" ||
    request.status === "archived" ||
    request.leadStage === "declined" ||
    request.leadStage === "lost" ||
    latestProposal?.status === "declined";
  const isConverted = Boolean(activeAccount) || request.status === "converted" || request.leadStage === "converted";

  let stage: LeadPipelineStage;
  if (isConverted) stage = "converted";
  else if (isClosed) stage = "closed";
  else if (latestAgreement?.status === "signed") stage = "onboarding";
  else if (latestProposal?.status === "accepted") stage = "agreement";
  else if (latestAgreement && latestAgreement.status !== "cancelled") stage = "agreement";
  else if (latestProposal?.status === "sent") stage = "decision";
  else if (latestProposal?.status === "draft" || latestWalkthrough?.status === "completed" || latestWalkthrough?.status === "proposal_created") stage = "proposal";
  else if (latestWalkthrough) stage = "walkthrough";
  else if (request.status === "contacted" || request.contactedAt || (request.leadStage && request.leadStage !== "new")) stage = "qualification";
  else stage = "new";

  const blockers: string[] = [];
  if (!request.requesterEmail?.trim() && !request.requesterPhone?.trim()) blockers.push("missing_contact_method");
  if (stage === "walkthrough" && !walkthroughIsScheduled) blockers.push("walkthrough_not_scheduled");
  if (stage === "proposal" && latestProposal?.status === "draft") blockers.push("proposal_not_sent");
  if (stage === "onboarding" && !request.clientRelationshipId) blockers.push("client_relationship_missing");

  const nextAction = (() => {
    if (latestProposal?.status === "accepted") return acceptedProposalAgreementAction(
      latestAgreement, Boolean(activeAccount), input.clientPortalStatus === "active"
    );
    if (stage === "closed" || stage === "converted") return { key: "view_request", hrefSuffix: "" };
    if (blockers[0] === "missing_contact_method") return { key: "add_contact_details", hrefSuffix: "#request-contact" };
    if (stage === "new" || stage === "qualification") return { key: "qualify_lead", hrefSuffix: "#request-lead-classification" };
    if (stage === "walkthrough") return { key: walkthroughIsScheduled ? "complete_walkthrough" : "schedule_walkthrough", hrefSuffix: "#request-walkthrough" };
    if (stage === "proposal") return { key: latestProposal ? "send_proposal" : "create_proposal", hrefSuffix: "#request-proposal" };
    if (stage === "decision") return { key: "follow_up_proposal", hrefSuffix: "#request-proposal" };
    if (stage === "agreement") return { key: "send_agreement", hrefSuffix: "#request-agreement" };
    return { key: input.clientPortalStatus === "active" ? "complete_service_setup" : "invite_client", hrefSuffix: "#request-client-portal" };
  })();

  const latestActivityAt = lastActivity(input);
  const overdue = Boolean(request.nextFollowUpAt && request.nextFollowUpAt <= now);
  const stale = stage !== "closed" && stage !== "converted" && now - latestActivityAt >= LEAD_STALE_AFTER_MS;
  const attention: LeadAttention =
    stage === "closed" || stage === "converted"
      ? "none"
      : overdue
        ? "overdue"
        : blockers.length
          ? "blocked"
          : stale
            ? "stale"
            : "active";

  return {
    stage,
    attention,
    blockers,
    nextAction,
    latestActivityAt,
    stale,
    linked: {
      property: Boolean(request.propertyId),
      clientRelationship: Boolean(request.clientRelationshipId),
      walkthrough: Boolean(latestWalkthrough),
      proposal: Boolean(latestProposal),
      agreement: Boolean(latestAgreement),
      commercialAccount: Boolean(activeAccount),
      clientPortal: input.clientPortalStatus,
    },
  };
}
