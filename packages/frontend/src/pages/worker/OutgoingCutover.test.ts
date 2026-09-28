import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName } from "convex/server";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import en from "../../i18n/en/common.json";
import es from "../../i18n/es/common.json";

let actor: any;
let calls: string[];
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: actor, sessionToken: "verified" }), getStaffSessionToken: () => "verified" }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...props }: any) => createElement("a", { href, ...props }, children) }));
vi.mock("@/components/ui/LoadingSpinner", () => ({ PageLoader: () => createElement("p", null, "Loading") }));
vi.mock("@/features/worker-home/WorkerHomePresentation", () => import("../../features/worker-home/WorkerHomePresentation"));
vi.mock("@/components/ui/PageHeader", () => import("../../components/ui/PageHeader"));
vi.mock("@/components/payments/LegacyOutgoingNotice", () => import("../../components/payments/LegacyOutgoingNotice"));
vi.mock("@/components/payments/FinancialBoundary", () => ({ FinancialBoundary: ({ children }: { children: ReactNode }) => children }));
vi.mock("convex/react", () => ({ useQuery: (query: any, args: any) => {
  if (args === "skip") return undefined;
  const name = getFunctionName(query);
  calls.push(name);
  if (name === "queries/jobs:getForCleaner") return [
    { _id: "planned", scheduledDate: "2099-01-01", status: "scheduled", propertyName: "Planned work", plannedCleanerPayCents: 98765, paymentStatus: "OPEN" },
    { _id: "approved", scheduledDate: "2020-01-01", status: "approved", propertyName: "Operationally approved work", plannedCleanerPayCents: 45678, paymentStatus: "OPEN" },
  ];
  if (name === "queries/teams:listMyTeams") return [];
  if (name === "queries/workers:getWorkerProfileForUser") return null;
  if (name === "queries/notifications:unreadCount") return 0;
  if (name === "queries/settlements:listMySettlements") return args.status === "open" ? [
    { _id: "old-open", createdAt: 1, direction: "owing", status: "open", counterpartyName: "Historical Partner", jobLabel: "Old shared work", currency: "usd", amountCents: 12345 },
  ] : [];
  throw new Error(`Unexpected financial query: ${name}`);
} }));
import { WorkerHomePage } from "./WorkerHomePage";
import { SettlementsPage } from "../owner/SettlementsPage";

async function render(component: any, lng: string) {
  const i18n = createInstance();
  await i18n.init({ lng, fallbackLng: "en", resources: { en: { translation: en }, es: { translation: es } }, interpolation: { escapeValue: false } });
  return renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(component)));
}

describe("PR F actual page cutover", () => {
  it.each(["en", "es"])("%s Worker Home never converts planned or approved operational work into money owed", async lng => {
    actor = { _id: "worker", companyId: "own", role: "cleaner", name: "Maya" }; calls = [];
    const html = await render(WorkerHomePage, lng);
    expect(html).toContain("Planned work");
    expect(html).toContain("Operationally approved work");
    expect(html).toContain('href="/payments"');
    expect(html).toContain((lng === "es" ? es : en).paymentsCutover.workerHomeHelp);
    expect(html).not.toMatch(/987\.65|456\.78|open payment|paymentStatus|item.*need attention/i);
    expect(calls.some(name => /cleanerPayments|outgoing|Compensation/.test(name))).toBe(false);
  });
  it.each(["en", "es"])("%s partner legacy page labels OPEN as historical and exposes only navigation", async lng => {
    actor = { _id: "owner", companyId: "own", role: "owner" }; calls = [];
    const html = await render(SettlementsPage, lng);
    const copy = lng === "es" ? es : en;
    expect(html).toContain(copy.paymentsCutover.partnerLegacyTitle);
    expect(html).toContain(copy.paymentsCutover.partnerLegacyHelp);
    expect(html).toContain(copy.compensation.legacyOpen);
    expect(html).toContain('href="/owner/payments"');
    expect(html).not.toContain("<button");
    expect(calls).toEqual(["queries/settlements:listMySettlements", "queries/settlements:listMySettlements"]);
  });
});
