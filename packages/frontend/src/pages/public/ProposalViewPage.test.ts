// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { getFunctionName } from "convex/server";
import { describe, expect, it, vi } from "vitest";
import en from "../../i18n/en/common.json";
import es from "../../i18n/es/common.json";
import { ProposalViewPage } from "./ProposalViewPage";

const actions = vi.hoisted(() => ({ load: vi.fn(), respond: vi.fn() }));
vi.mock("wouter", () => ({ useParams: () => ({ token: "test-offer-token" }) }));
vi.mock("convex/react", () => ({
  useAction: (action: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(action).endsWith(":getProposalByToken") ? actions.load : actions.respond,
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, args?: Record<string, string>) => {
  const label = key.split(".").reduce<any>((obj, part) => obj?.[part], args?.lng === "es" ? es : en);
  return typeof label === "string" ? label.replace(/\{\{(\w+)\}\}/g, (_, name) => args?.[name] ?? "") : key;
} }) }));

describe("signed-out proposal response", () => {
  it.each([["en", en, "accepted"], ["es", es, "declined"]] as const)("shows how to respond in %s without portal access", async (locale, labels, decision) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    const root = createRoot(container);
    const offer = {
      company: { companyName: "Test Cleaning", companyEmail: "test@example.test" },
      presentation: { locale },
      clientName: "Test Client",
      proposal: { title: "Office cleaning", status: "sent", scopeOfWork: "Clean the kitchen" },
    };
    actions.load.mockResolvedValue(offer);
    actions.respond.mockResolvedValue({ ...offer, proposal: { ...offer.proposal, status: decision } });
    try {
      await act(async () => root.render(createElement(ProposalViewPage)));
      expect(container.textContent).toContain(labels.proposals.deliveryReview.noAccount);
      expect(container.textContent).toContain("test@example.test");
      const label = labels.proposals.branded[decision === "accepted" ? "accept" : "decline"];
      const button = () => Array.from(container.querySelectorAll("button")).find(item => item.textContent?.trim() === label);
      await act(async () => button()!.click());
      expect(actions.respond).toHaveBeenCalledWith(expect.objectContaining({ token: "test-offer-token", decision }));
      expect(container.textContent).toContain(decision === "accepted"
        ? labels.proposals.deliveryReview.acceptedNext.replace("{{company}}", "Test Cleaning")
        : labels.proposals.branded.declinedTitle);
      expect(button()).toBeUndefined();
      expect(container.querySelector('a[href^="/client/"]')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
      actions.load.mockReset();
      actions.respond.mockReset();
    }
  });
});
