import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  walkthrough: { _id: "walkthrough", title: "Site visit", walkthroughType: "commercial", status: "completed", appointmentStatus: "completed" },
  createProposal: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: (_query: unknown, args: unknown) => {
    if (args === "skip") return undefined;
    if (args && typeof args === "object" && "clientRequestId" in args) return [mocks.walkthrough];
    return [];
  },
  useMutation: () => mocks.createProposal,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { _id: "owner", companyId: "company" }, sessionToken: "session" }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => ({ "proposals.create": "Create Proposal", "proposals.open": "Open Proposal" })[key] ?? key }) }));

import { WalkthroughCard } from "../../components/owner/WalkthroughCard";

describe("walkthrough to proposal continuity", () => {
  it("offers an explicit Create Proposal action after completion", () => {
    mocks.createProposal.mockClear();
    const html = renderToStaticMarkup(createElement(WalkthroughCard, {
      clientRequestId: "request" as any,
      proposalExists: false,
      onProposalNextAction: () => {},
    }));
    expect(html).toContain("Create Proposal");
    expect(html).not.toContain("Open Proposal");
    expect(mocks.createProposal).not.toHaveBeenCalled();
  });

  it("offers Open Proposal when one already exists", () => {
    const html = renderToStaticMarkup(createElement(WalkthroughCard, {
      clientRequestId: "request" as any,
      proposalExists: true,
      onProposalNextAction: () => {},
    }));
    expect(html).toContain("Open Proposal");
    expect(html).not.toContain("Create Proposal");
  });

  it("keeps existing proposal rendering ahead of walkthrough eligibility", () => {
    const details = readFileSync(resolve(process.cwd(), "packages/frontend/src/pages/owner/RequestDetailPage.tsx"), "utf8");
    expect(details).toContain("!proposal && !proposalUnlocked");
    expect(details).toContain("onProposalNextAction={proposal ? () => openProposalSection() : handleCreateProposal}");
    expect(details).toContain("expanded={proposalExpanded}");
    expect(details).toContain("eligibleProposalWalkthroughs.length > 1");
    expect(details).toContain("sourceWalkthroughId });");
    const card = readFileSync(resolve(process.cwd(), "packages/frontend/src/components/owner/WalkthroughCard.tsx"), "utf8");
    expect(card).toContain("onProposalNextAction(walkthrough._id)");
  });

  it("requires scope confirmation and applies the estimate only to the editable monthly base field", () => {
    const card = readFileSync(resolve(process.cwd(), "packages/frontend/src/components/owner/WalkthroughCard.tsx"), "utf8");
    const details = readFileSync(resolve(process.cwd(), "packages/frontend/src/pages/owner/RequestDetailPage.tsx"), "utf8");
    expect(card).toContain("scopeNotes: e.target.value, scopeProposalReady: false");
    expect(card).toContain("proposalReadyScopeText: form.scopeProposalReady ? form.scopeNotes : undefined");
    expect(details).toContain("monthlyPrice: String(proposal.assessmentSuggestedMonthlyPriceCents / 100)");
    expect(details).toContain("monthlyPriceCents: centsFromPrice(proposalForm.monthlyPrice)");
  });
});
