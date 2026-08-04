export type ClientRequestTimelineState = "complete" | "current" | "terminal";
export type ClientRequestTimelineKind =
  | "submitted"
  | "under_review"
  | "schedule_proposed"
  | "schedule_proposal_accepted"
  | "schedule_proposal_declined"
  | "proposal_available"
  | "proposal_accepted"
  | "agreement_available"
  | "agreement_acknowledged"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "declined";

export interface ClientRequestTimelineEvent {
  id: string;
  kind: ClientRequestTimelineKind;
  occurredAt?: number;
  state: ClientRequestTimelineState;
  destination?: { labelKey: string; href: string };
}

export interface ClientRequestStatusSummary {
  status: string;
  meaningKey: string;
  nextKey: string;
  action?: { labelKey: string; href: string };
}

const complete = (
  id: string,
  kind: ClientRequestTimelineKind,
  occurredAt?: number,
  destination?: ClientRequestTimelineEvent["destination"],
): ClientRequestTimelineEvent => ({
  id,
  kind,
  occurredAt,
  state: "complete",
  destination,
});

export function deriveClientRequestTimeline(
  request: any,
): ClientRequestTimelineEvent[] {
  const facts = request.timelineFacts ?? {
    request: {},
    proposals: [],
    agreements: [],
    jobs: [],
  };
  const events: ClientRequestTimelineEvent[] = [
    complete("submitted", "submitted", facts.request.submittedAt),
  ];
  if (facts.request.contactedAt || facts.request.status === "contacted")
    events.push(
      complete("under-review", "under_review", facts.request.contactedAt),
    );
  const scheduleProposal = [...(facts.scheduleProposals ?? [])].sort(
    (a: any, b: any) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
  )[0];
  if (scheduleProposal)
    events.push(
      complete(
        "schedule-proposed",
        "schedule_proposed",
        scheduleProposal.createdAt,
      ),
    );
  if (scheduleProposal?.status === "accepted")
    events.push(
      complete(
        "schedule-proposal-accepted",
        "schedule_proposal_accepted",
        scheduleProposal.acceptedAt,
      ),
    );
  if (scheduleProposal?.status === "declined")
    events.push(
      complete(
        "schedule-proposal-declined",
        "schedule_proposal_declined",
        scheduleProposal.declinedAt,
      ),
    );
  const proposal = [...facts.proposals].sort(
    (a: any, b: any) =>
      (b.sentAt ?? b.acceptedAt ?? 0) - (a.sentAt ?? a.acceptedAt ?? 0),
  )[0];
  if (proposal && ["sent", "accepted", "declined"].includes(proposal.status))
    events.push(
      complete("proposal-available", "proposal_available", proposal.sentAt, {
        labelKey: "clientRequests.timeline.actions.documents",
        href: "/client/documents",
      }),
    );
  if (proposal?.status === "accepted")
    events.push(
      complete("proposal-accepted", "proposal_accepted", proposal.acceptedAt),
    );
  const agreement = [...facts.agreements].sort(
    (a: any, b: any) =>
      (b.sentAt ?? b.signedAt ?? 0) - (a.sentAt ?? a.signedAt ?? 0),
  )[0];
  if (agreement && ["sent", "signed", "cancelled"].includes(agreement.status))
    events.push(
      complete(
        "agreement-available",
        "agreement_available",
        agreement.sentAt,
        agreement._id
          ? {
              labelKey: "clientRequests.timeline.actions.agreement",
              href: `/client/service-agreements/${agreement._id}`,
            }
          : {
              labelKey: "clientRequests.timeline.actions.documents",
              href: "/client/documents",
            },
      ),
    );
  if (agreement?.status === "signed")
    events.push(
      complete(
        "agreement-acknowledged",
        "agreement_acknowledged",
        agreement.signedAt ?? agreement.clientRespondedAt,
      ),
    );
  const job =
    facts.jobs.find((item: any) => item.status === "in_progress") ??
    facts.jobs.find(
      (item: any) =>
        !["cancelled", "denied", "approved"].includes(item.status) &&
        !item.completedAt,
    ) ??
    facts.jobs.find(
      (item: any) => item.status === "approved" || item.completedAt,
    );
  if (job)
    events.push(
      complete("scheduled", "scheduled", undefined, {
        labelKey: "clientRequests.timeline.actions.services",
        href: "/client/services",
      }),
    );
  if (job?.status === "in_progress")
    events.push(
      complete("in-progress", "in_progress", job.startedAt, {
        labelKey: "clientRequests.timeline.actions.services",
        href: "/client/services",
      }),
    );
  if (job && (job.status === "approved" || job.completedAt))
    events.push(
      complete("completed", "completed", job.completedAt ?? job.approvedAt, {
        labelKey: "clientRequests.timeline.actions.services",
        href: "/client/services",
      }),
    );
  if (facts.request.status === "declined")
    events.push({
      id: "declined",
      kind: "declined",
      state: "terminal",
      ...(facts.request.declinedAt !== undefined
        ? { occurredAt: facts.request.declinedAt }
        : {}),
    });
  const lastEvent = events[events.length - 1];
  const currentKind =
    request.status === "processing" ? undefined : request.status;
  const current =
    request.status === "processing"
      ? [...events]
          .reverse()
          .find((event) => !["submitted", "under_review"].includes(event.kind))
      : ([...events].reverse().find((event) => event.kind === currentKind) ??
        lastEvent);
  if (current && current.state !== "terminal") current.state = "current";
  return events;
}

export function getClientRequestStatusSummary(
  request: any,
): ClientRequestStatusSummary {
  const status = request.status;
  const summary: ClientRequestStatusSummary = {
    status,
    meaningKey: `clientRequests.statusSummary.${status}.meaning`,
    nextKey: `clientRequests.statusSummary.${status}.next`,
  };
  if (status === "proposal_available")
    summary.action = {
      labelKey: "clientRequests.timeline.actions.documents",
      href: "/client/documents",
    };
  if (status === "agreement_available") {
    const agreement = request.agreements?.find(
      (item: any) => item.status === "sent",
    );
    summary.action = agreement
      ? {
          labelKey: "clientRequests.timeline.actions.agreement",
          href: `/client/service-agreements/${agreement._id}`,
        }
      : {
          labelKey: "clientRequests.timeline.actions.documents",
          href: "/client/documents",
        };
  }
  if (["scheduled", "in_progress", "completed"].includes(status))
    summary.action = {
      labelKey: "clientRequests.timeline.actions.services",
      href: "/client/services",
    };
  return summary;
}
