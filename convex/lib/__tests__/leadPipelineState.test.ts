import { describe, expect, it } from "vitest";
import { deriveLeadPipelineState, LEAD_STALE_AFTER_MS } from "../leadPipelineState";

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
    expect(state.stage).toBe("onboarding");
    expect(state.linked).toMatchObject({ property: true, clientRelationship: true, proposal: true, clientPortal: "pending" });
    expect(state.nextAction).toEqual({ key: "invite_client", hrefSuffix: "#request-client-portal" });
  });
});
