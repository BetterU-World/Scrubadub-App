// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { getFunctionName } from "convex/server";
import { describe, expect, it, vi } from "vitest";
import en from "../../i18n/en/common.json";
import { SmartEstimateBuilder } from "./SmartEstimateBuilder";

const mocks = vi.hoisted(() => ({
  workspace: {} as Record<string, unknown>,
  open: vi.fn(),
  approve: vi.fn(),
  apply: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useQuery: (reference: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(reference).endsWith(":workspace") ? mocks.workspace : [],
  useMutation: (reference: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(reference);
    if (name.endsWith(":previewOpen")) return mocks.open;
    if (name.endsWith(":previewApprove")) return mocks.approve;
    if (name.endsWith(":previewApply")) return mocks.apply;
    return vi.fn();
  },
}));
vi.mock("@/components/ui/DialogShell", () => ({
  DialogShell: ({ children, footer }: { children: ReactNode; footer: ReactNode }) =>
    createElement("div", null, children, footer),
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({
  i18n: { language: "en" },
  t: (key: string) => key.split(".").reduce<any>((obj, part) => obj?.[part], en) ?? key,
}) }));

describe("flat price approval and direct proposal application", () => {
  it("identifies the required base, waits for a saved draft and applies only after the direct proposal exists", async () => {
    mocks.workspace = { draft: null, approval: null, propertyType: "residential", proposal: null, facts: {} };
    mocks.open.mockResolvedValue("estimate-id");
    mocks.approve.mockResolvedValue("approval-id");
    mocks.apply.mockResolvedValue(6);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    const root = createRoot(container);
    const onApplied = vi.fn();
    const auth = { userId: "owner" as any, sessionToken: "test-session" };
    const clientRequestId = "request" as any;
    const view = () => createElement(SmartEstimateBuilder, { auth, clientRequestId, proposalDirty: false,
      onClose() {}, onReviewAddOns() {}, onApplied });
    const button = (name: string) => Array.from(container.querySelectorAll("button")).find(item => item.textContent === name)!;
    const change = async (name: string, value: string) => {
      const label = Array.from(container.querySelectorAll("label")).find(item => item.textContent?.startsWith(name))!;
      const input = label.querySelector("input")!;
      await act(async () => { input.value = value; Simulate.change(input); });
    };
    const copy = en.smartEstimates;
    try {
      await act(async () => root.render(view()));
      await change(copy.fields.override, "210");
      expect(button(copy.approve).disabled).toBe(true);
      expect(container.textContent).toContain(copy.flatInputMissing);
      await change(copy.fields.flatBase, "200");
      expect(container.textContent).toContain(copy.saveBeforeApproval);
      expect(button(copy.approve).disabled).toBe(true);
      await act(async () => button(copy.save).click());
      expect(mocks.open).toHaveBeenCalledWith(expect.objectContaining({ clientRequestId,
        input: expect.objectContaining({ baseCents: 20000 }), override: expect.objectContaining({ baseCents: 21000 }) }));
      mocks.workspace = { ...mocks.workspace, draft: { id: "estimate-id", draftRevision: 1 } };
      await act(async () => root.render(view()));
      await act(async () => button(copy.approve).click());
      expect(mocks.approve).toHaveBeenCalledWith({ ...auth, estimateId: "estimate-id", expectedDraftRevision: 1, proposal: undefined });
      mocks.workspace = { ...mocks.workspace, approval: { id: "approval-id", stale: false } };
      await act(async () => root.render(view()));
      expect(button(copy.apply).disabled).toBe(true);
      expect(container.textContent).toContain(copy.noProposal);
      mocks.workspace = { ...mocks.workspace, proposal: { id: "direct-proposal", updatedAt: 5, editable: true, lines: [] } };
      await act(async () => root.render(view()));
      await act(async () => button(copy.apply).click());
      expect(mocks.apply).toHaveBeenCalledWith({ ...auth, estimateId: "estimate-id", revisionId: "approval-id",
        proposalId: "direct-proposal", expectedProposalRevision: 5 });
      expect(onApplied).toHaveBeenCalledWith(6);
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
      vi.clearAllMocks();
    }
  });
});
