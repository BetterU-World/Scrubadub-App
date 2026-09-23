import { describe, expect, it } from "vitest";
import { acceptedProposalAgreementAction, deriveLeadPipelineState, LEAD_STALE_AFTER_MS } from "../leadPipelineState";

const NOW = 2_000_000_000_000;
const base = (overrides: any = {}) => ({
  request: { status: "new", createdAt: NOW - 1_000, requesterEmail: "lead@test.dev", ...overrides.request },
  walkthroughs: overrides.walkthroughs ?? [],
  proposals: overrides.proposals ?? [],
  agreements: overrides.agreements ?? [],
  commercialAccounts: overrides.commercialAccounts ?? [],
  clientPortalStatus: overrides.clientPortalStatus ?? "not_invited",
  now: NOW,
});

describe("derived lead pipeline state", () => {
  it("uses canonical lifecycle precedence without mutating the legacy stage", () => {
    expect(deriveLeadPipelineState(base()).stage).toBe("new");
    expect(deriveLeadPipelineState(base({ walkthroughs: [{ status: "draft", updatedAt: NOW }] })).stage).toBe("walkthrough");
    expect(deriveLeadPipelineState(base({ walkthroughs: [{ status: "completed", updatedAt: NOW }] })).stage).toBe("proposal");
    expect(deriveLeadPipelineState(base({ proposals: [{ status: "sent", updatedAt: NOW }] })).stage).toBe("decision");
    expect(deriveLeadPipelineState(base({ agreements: [{ status: "sent", updatedAt: NOW }] })).stage).toBe("agreement");
    expect(deriveLeadPipelineState(base({ agreements: [{ status: "signed", updatedAt: NOW }] })).stage).toBe("onboarding");
    expect(deriveLeadPipelineState(base({ commercialAccounts: [{ status: "active", updatedAt: NOW }] })).stage).toBe("converted");
  });

  it("separates a scheduled appointment from its draft assessment", () => {
    const state = deriveLeadPipelineState(base({
      walkthroughs: [{ status: "draft", appointmentStatus: "scheduled", scheduledDate: "2030-01-10", scheduledStartTime: "09:00", updatedAt: NOW }],
    }));
    expect(state.stage).toBe("walkthrough");
    expect(state.blockers).not.toContain("walkthrough_not_scheduled");
    expect(state.nextAction).toEqual({ key: "complete_walkthrough", hrefSuffix: "#request-walkthrough" });
  });

  it("keeps unscheduled, cancelled, archived, and legacy walkthroughs readable", () => {
    const unscheduled = deriveLeadPipelineState(base({ walkthroughs: [{ status: "draft", appointmentStatus: "draft", updatedAt: NOW }] }));
    expect(unscheduled.blockers).toContain("walkthrough_not_scheduled");
    expect(unscheduled.nextAction.key).toBe("schedule_walkthrough");

    const cancelled = deriveLeadPipelineState(base({ walkthroughs: [{ status: "draft", appointmentStatus: "cancelled", scheduledDate: "2030-01-10", scheduledStartTime: "09:00", updatedAt: NOW }] }));
    expect(cancelled.blockers).toContain("walkthrough_not_scheduled");
    expect(cancelled.nextAction.key).toBe("schedule_walkthrough");

    const archived = deriveLeadPipelineState(base({ walkthroughs: [{ status: "archived", appointmentStatus: "scheduled", updatedAt: NOW }] }));
    expect(archived.stage).toBe("new");

    const legacy = deriveLeadPipelineState(base({ walkthroughs: [{ status: "draft", scheduledDate: "2030-01-10", scheduledStartTime: "09:00", updatedAt: NOW }] }));
    expect(legacy.blockers).not.toContain("walkthrough_not_scheduled");
    expect(legacy.nextAction.key).toBe("complete_walkthrough");

    const completed = deriveLeadPipelineState(base({ walkthroughs: [{ status: "completed", appointmentStatus: "completed", updatedAt: NOW }] }));
    expect(completed.stage).toBe("proposal");
    expect(completed.nextAction.key).toBe("create_proposal");
  });

  it("keeps closed leads closed even when older linked records exist", () => {
    const state = deriveLeadPipelineState(base({
      request: { status: "archived" },
      agreements: [{ status: "signed", updatedAt: NOW }],
      commercialAccounts: [{ status: "ended", updatedAt: NOW }],
    }));
    expect(state.stage).toBe("closed");
    expect(state.attention).toBe("none");
  });

  it("selects the newest proposal when multiple versions exist", () => {
    const state = deriveLeadPipelineState(base({ proposals: [
      { status: "declined", updatedAt: NOW - 100 },
      { status: "draft", updatedAt: NOW },
    ] }));
    expect(state.stage).toBe("proposal");
    expect(state.nextAction.key).toBe("send_proposal");
  });

  it("prioritizes overdue follow-up, then blockers, then stale inactivity", () => {
    expect(deriveLeadPipelineState(base({ request: { nextFollowUpAt: NOW - 1 } })).attention).toBe("overdue");
    expect(deriveLeadPipelineState(base({ request: { requesterEmail: "", requesterPhone: "" } })).attention).toBe("blocked");
    expect(deriveLeadPipelineState(base({ request: { createdAt: NOW - LEAD_STALE_AFTER_MS } })).attention).toBe("stale");
  });

  it("reports linked records and routes the next action to existing detail anchors", () => {
    const state = deriveLeadPipelineState(base({
      request: { propertyId: "property", clientRelationshipId: "client" },
      proposals: [{ status: "accepted", updatedAt: NOW }],
      clientPortalStatus: "pending",
    }));
    expect(state.stage).toBe("agreement");
    expect(state.linked).toMatchObject({ property: true, clientRelationship: true, proposal: true, clientPortal: "pending" });
    expect(state.nextAction).toEqual({ key: "create_agreement", hrefSuffix: "#request-agreement" });
  });

  it("maps each accepted-proposal agreement lifecycle without conflating acknowledgment and signed receipt", () => {
    const cases = [
      [undefined, "create_agreement"],
      [{ status: "draft" }, "review_agreement"],
      [{ status: "ready" }, "issue_agreement"],
      [{ status: "sent" }, "await_client_acknowledgment"],
      [{ status: "signed", acknowledgedAt: NOW }, "acknowledged_continue_setup"],
      [{ status: "signed", signedAt: NOW }, "signed_received_continue_setup"],
      [{ status: "cancelled", declinedAt: NOW }, "review_declined_agreement"],
      [{ status: "cancelled" }, "review_cancelled_agreement"],
      [{ status: "sent", sentAt: NOW }, "await_client_acknowledgment"],
    ] as const;
    for (const [agreement, key] of cases) {
      expect(acceptedProposalAgreementAction(agreement, false, true).key).toBe(key);
    }
    expect(acceptedProposalAgreementAction({ status: "sent" }, false, false))
      .toEqual({ key: "enable_client_access", hrefSuffix: "#request-client-portal" });
    expect(acceptedProposalAgreementAction({ status: "signed", acknowledgedAt: NOW }, true, true).key)
      .toBe("review_commercial_account");
  });

  it("keeps the agreement action after an account was created first and matches the accepted proposal", () => {
    const state = deriveLeadPipelineState(base({
      proposals: [{ _id: "accepted", status: "accepted", updatedAt: NOW }],
      agreements: [{ proposalId: "older", status: "sent", updatedAt: NOW }],
      commercialAccounts: [{ status: "active", updatedAt: NOW }],
    }));
    expect(state.stage).toBe("converted");
    expect(state.nextAction.key).toBe("create_agreement");
  });
});
