// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { Blob as NodeBlob } from "node:buffer";
import { afterEach, expect, it, vi } from "vitest";
import { GiveawayOperatorPage } from "./GiveawayOperatorPage";
import { firstGiveawayId } from "../../../../../convex/lib/giveawayCampaigns";
import { giveawayTwoId } from "../../../../../convex/lib/giveawayCampaignTwo";

const data = vi.hoisted(() => ({ campaignId: "", superadmin: true }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { _id: "synthetic-admin", isSuperadmin: data.superadmin }, sessionToken: "synthetic-session", isLoading: false }) }));
vi.mock("convex/react", () => ({
  useQuery: (_ref: unknown, args: { campaignId: string } | "skip") => args === "skip" ? null : ({ campaign: { campaignId: args.campaignId, name: args.campaignId, prize: "$50", state: "active", startsAt: 1, deadlineLabel: "Close", drawingLabel: "Draw" }, scanCapped: false, entries: { total: 2, assessment: 1, alternate: 1, latestQualifiedAt: 1 }, analytics: { qualifiedAssessment: 1, qualifiedAlternate: 1, duplicateEvents: 0 } }),
  usePaginatedQuery: (_ref: unknown, args: { campaignId: string } | "skip") => {
    if (args !== "skip") data.campaignId = args.campaignId;
    return { status: "Exhausted", loadMore: () => {}, results: args === "skip" ? [] : ["assessment", "alternate"].map((entryMethod, index) => ({
      _id: `${args.campaignId}-${index}`, campaignId: args.campaignId, qualifiedAt: 1, entryMethod,
      originalEmail: `${index}@example.test`, firstName: index ? "=SYNTHETIC" : "Pat", status: "qualified", rulesVersion: "rules-v1", eligibilityConfirmedAt: 1, marketingConsent: false,
    })) };
  },
}));
afterEach(() => { data.superadmin = true; vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ""; });

it("switches campaign pools and exports both methods despite the display filter", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("Blob", NodeBlob);
  let exported: NodeBlob | undefined;
  const revoke = vi.fn();
  vi.stubGlobal("URL", { createObjectURL: (blob: NodeBlob) => { exported = blob; return "blob:synthetic"; }, revokeObjectURL: revoke });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(GiveawayOperatorPage)));
    const select = container.querySelector("select")!;
    await act(async () => { select.value = giveawayTwoId; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(data.campaignId).toBe(giveawayTwoId);
    await act(async () => Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Assessment")!.click());
    await act(async () => Array.from(container.querySelectorAll("button")).find(button => button.textContent?.includes("Export loaded entrants"))!.click());
    const text = await exported!.text();
    expect(text).toContain(giveawayTwoId); expect(text).not.toContain(firstGiveawayId);
    expect(text).toContain('"assessment"'); expect(text).toContain('"alternate"');
    expect(text).toContain("'=SYNTHETIC"); expect(revoke).toHaveBeenCalledTimes(1);
    await act(async () => { select.value = firstGiveawayId; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(data.campaignId).toBe(firstGiveawayId);
  } finally { await act(async () => root.unmount()); }
});
