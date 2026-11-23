// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../../../../convex/schema";
import { api } from "../../../../../convex/_generated/api";
import { hashPassword } from "../../../../../convex/lib/password";
import en from "../../i18n/en/common.json";
import es from "../../i18n/es/common.json";

const mocks = vi.hoisted(() => ({
  walkthroughs: [{ _id: "walkthrough", title: "Site visit", walkthroughType: "commercial", status: "completed", appointmentStatus: "completed" }] as Record<string, unknown>[],
  createProposal: vi.fn(),
  userId: "owner",
  sessionToken: "session",
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
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { _id: mocks.userId, companyId: "company" }, sessionToken: mocks.sessionToken }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) =>
  key.split(".").reduce<any>((value, part) => value?.[part], mocks.language === "en" ? en : es) ?? key,
}) }));

import { WalkthroughCard } from "../../components/owner/WalkthroughCard";

const completedWalkthroughs = mocks.walkthroughs;
const modules = import.meta.glob("../../../../../convex/**/*.ts");
afterEach(() => {
  mocks.walkthroughs = completedWalkthroughs;
  mocks.language = "en";
  mocks.createProposal.mockReset();
  mocks.userId = "owner";
  mocks.sessionToken = "session";
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("walkthrough to proposal continuity", () => {
  it.each([["en", en], ["es", es]] as const)("supports starting and resuming from stacked %s mobile controls", async (language, labels) => {
    mocks.language = language;
    mocks.walkthroughs = [];
    vi.stubEnv("TOKEN_PEPPER", "walkthrough-test-token-pepper");
    vi.stubGlobal("crypto", webcrypto);
    const t = convexTest(schema, modules);
    const email = "owner-walkthrough@example.com";
    const password = "walkthrough-test-password";
    const passwordHash = await hashPassword(password);
    const { userId, clientRequestId } = await t.run(async ctx => {
      const companyId = await ctx.db.insert("companies", { name: "Walkthroughs", timezone: "America/New_York" });
      const userId = await ctx.db.insert("users", { companyId, email, passwordHash, name: "Owner", role: "owner", status: "active" });
      const clientRequestId = await ctx.db.insert("clientRequests", {
        companyId, requesterName: "Test client", requesterEmail: "client@example.com",
        propertySnapshot: {}, status: "new", source: "manual", createdAt: Date.now(),
      });
      return { userId, clientRequestId };
    });
    const { sessionToken } = await t.action(api.authActions.signIn, { email, password });
    mocks.userId = userId;
    mocks.sessionToken = sessionToken;
    const queryArgs = { userId, sessionToken, clientRequestId };
    mocks.createProposal.mockImplementationOnce(args => t.mutation(api.mutations.walkthroughs.startFromClientRequest, args));
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const view = () => createElement(WalkthroughCard, { clientRequestId, allowCreate: true });
    const button = (label: string) => Array.from(container.querySelectorAll("button")).find(item => item.textContent?.trim() === label);
    try {
      await act(async () => root.render(view()));
      const start = button(labels.walkthroughs.startNow)!;
      const schedule = button(labels.walkthroughs.schedule)!;
      expect(start.className).toContain("min-h-11 w-full");
      expect(schedule.className).toContain("min-h-11 w-full");
      expect(start.parentElement?.className).toContain("flex-col");
      expect(container.querySelector('input[type="date"]')).toBeNull();
      await act(async () => {
        start.click();
        await mocks.createProposal.mock.results[0].value;
      });
      expect(mocks.createProposal).toHaveBeenCalledExactlyOnceWith(queryArgs);
      mocks.walkthroughs = await t.query(api.queries.walkthroughs.listByClientRequest, queryArgs);
      const started = mocks.walkthroughs[0];
      await act(async () => root.render(view()));
      const focused = document.activeElement;
      expect(focused?.textContent).toBe(labels.walkthroughs.findings);
      expect(container.querySelector("details")?.open).toBe(false);
      const scope = Array.from(container.querySelectorAll("label")).find(field =>
        field.textContent?.includes(labels.walkthroughs.fields.scopeNotes))!.querySelector("textarea")!;
      await act(async () => {
        scope.value = "Kitchen findings";
        Simulate.change(scope);
      });
      mocks.createProposal.mockImplementationOnce(args => t.mutation(api.mutations.walkthroughs.update, args));
      await act(async () => {
        button(labels.common.save)!.click();
        await mocks.createProposal.mock.results[1].value;
      });
      expect(mocks.createProposal).toHaveBeenLastCalledWith(expect.objectContaining({
        walkthroughId: started._id, appointmentStatus: "draft", scopeNotes: "Kitchen findings",
        scheduledDate: undefined, scheduledStartTime: undefined, scheduledEndTime: undefined,
      }));
      mocks.walkthroughs = await t.query(api.queries.walkthroughs.listByClientRequest, queryArgs);
      expect(mocks.walkthroughs[0]).toMatchObject({ scopeNotes: "Kitchen findings", startedAt: started.startedAt });
      expect(mocks.walkthroughs[0].scheduledDate).toBeUndefined();
      expect(mocks.walkthroughs[0].scheduledStartTime).toBeUndefined();
      await act(async () => root.render(view()));
      expect(button(labels.walkthroughs.startNow)).toBeUndefined();
      await act(async () => button(labels.walkthroughs.resume)!.click());
      expect(Array.from(container.querySelectorAll("textarea")).some(field => field.value === "Kitchen findings")).toBe(true);
      expect(mocks.createProposal).toHaveBeenCalledTimes(2);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it("offers an explicit Create Proposal action after completion", () => {
    mocks.createProposal.mockClear();
    const html = renderToStaticMarkup(createElement(WalkthroughCard, {
      clientRequestId: "request" as any,
      allowCreate: true,
      proposalExists: false,
      onProposalNextAction: () => {},
    }));
    expect(html).toContain("Create Proposal");
    expect(html).toContain(en.walkthroughs.completedRequestHelp);
    const buttons = Array.from(new DOMParser().parseFromString(html, "text/html").querySelectorAll("button"),
      item => item.textContent?.trim());
    expect(buttons).not.toContain(en.walkthroughs.startNow);
    expect(buttons).not.toContain(en.walkthroughs.resume);
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
