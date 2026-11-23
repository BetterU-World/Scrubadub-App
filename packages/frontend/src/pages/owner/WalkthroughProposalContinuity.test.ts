// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../i18n/en/common.json";
import es from "../../i18n/es/common.json";

const mocks = vi.hoisted(() => ({
  walkthroughs: [{ _id: "walkthrough", title: "Site visit", walkthroughType: "commercial", status: "completed", appointmentStatus: "completed" }] as Record<string, unknown>[],
  createProposal: vi.fn(),
  language: "en" as "en" | "es",
}));

vi.mock("convex/react", () => ({
  useQuery: (_query: unknown, args: unknown) => {
    if (args === "skip") return undefined;
    if (args && typeof args === "object" && "clientRequestId" in args) return mocks.walkthroughs;
    return [];
  },
  useMutation: () => mocks.createProposal,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { _id: "owner", companyId: "company" }, sessionToken: "session" }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) =>
  key.split(".").reduce<any>((value, part) => value?.[part], mocks.language === "en" ? en : es) ?? key,
}) }));

import { WalkthroughCard } from "../../components/owner/WalkthroughCard";

const completedWalkthroughs = mocks.walkthroughs;
afterEach(() => {
  mocks.walkthroughs = completedWalkthroughs;
  mocks.language = "en";
  mocks.createProposal.mockReset();
  vi.unstubAllGlobals();
});

describe("walkthrough to proposal continuity", () => {
  it.each([["en", en], ["es", es]] as const)("supports starting and resuming from stacked %s mobile controls", async (language, labels) => {
    mocks.language = language;
    mocks.walkthroughs = [];
    mocks.createProposal.mockResolvedValue("started");
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const view = () => createElement(WalkthroughCard, { clientRequestId: "request" as any, allowCreate: true });
    const button = (label: string) => Array.from(container.querySelectorAll("button")).find(item => item.textContent?.trim() === label);
    try {
      await act(async () => root.render(view()));
      const start = button(labels.walkthroughs.startNow)!;
      const schedule = button(labels.walkthroughs.schedule)!;
      expect(start.className).toContain("min-h-11 w-full");
      expect(schedule.className).toContain("min-h-11 w-full");
      expect(start.parentElement?.className).toContain("flex-col");
      expect(container.querySelector('input[type="date"]')).toBeNull();
      await act(async () => start.click());
      expect(mocks.createProposal).toHaveBeenCalledExactlyOnceWith({ userId: "owner", sessionToken: "session", clientRequestId: "request" });
      mocks.walkthroughs = [{ _id: "started", title: "Site visit", walkthroughType: "residential", status: "draft",
        appointmentStatus: "draft", startedAt: 123, scopeNotes: "Saved findings" }];
      await act(async () => root.render(view()));
      const focused = document.activeElement;
      expect(focused?.textContent).toBe(labels.walkthroughs.findings);
      expect(container.querySelector("details")?.open).toBe(false);
      expect(Array.from(container.querySelectorAll("textarea")).some(field => field.value === "Saved findings")).toBe(true);
      await act(async () => button(labels.common.cancel)!.click());
      expect(button(labels.walkthroughs.startNow)).toBeUndefined();
      await act(async () => button(labels.walkthroughs.resume)!.click());
      expect(Array.from(container.querySelectorAll("textarea")).some(field => field.value === "Saved findings")).toBe(true);
      expect(mocks.createProposal).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

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
    const editor = readFileSync(resolve(process.cwd(), "packages/frontend/src/components/owner/ProposalEditor.tsx"), "utf8");
    expect(card).toContain("scopeNotes: e.target.value, scopeProposalReady: false");
    expect(card).toContain("proposalReadyScopeText: form.scopeProposalReady ? form.scopeNotes : undefined");
    expect(editor).toContain('onChange("monthlyPrice", String(estimated / 100))');
    expect(details).toContain("monthlyPriceCents: centsFromPrice(proposalForm.monthlyPrice)");
  });
});
