import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../i18n/en/common.json";
import es from "../../i18n/es/common.json";
import { deriveClientRequestTimeline } from "../../lib/clientRequestTimeline";
import type { ClientSchedulingEvent } from "./ClientSchedulingUpdates";

const state = vi.hoisted(() => ({ language: "en" }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: state.language }, t: (key: string, args?: any) => {
  const value = key.split(".").reduce((obj: any, part) => obj?.[part], state.language === "es" ? es : en) ?? key;
  return typeof value === "string" ? value.replace("{{timezone}}", args?.timezone ?? "").replace("{{provider}}", args?.provider ?? "") : key;
} }) }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement("a", { href, ...props }, children) }));
vi.mock("./ClientPortalPage", () => ({
  ClientPortalSection: ({ title, children }: any) => createElement("section", null, createElement("h2", null, title), children),
  formatClientDate: (value: string | number) => String(value),
}));
vi.mock("../ui/ServiceAgreementStatusBadge", () => ({ ServiceAgreementStatusBadge: () => null }));
import { ClientSchedulingUpdates } from "./ClientSchedulingUpdates";
import { ClientRequestDetailPresentation, ClientRequestTimeline } from "./ClientRequestPresentation";
import { ClientServicesPresentation } from "../../pages/client/ClientServicesPage";

const confirmed: ClientSchedulingEvent = { id: "confirm-1", kind: "service_confirmed", requestId: "request-1", occurredAt: 1000,
  timezone: "America/New_York", locationName: "Authorized current location", providerName: "Company",
  after: { scheduledDate: "2030-01-03", startTime: "09:00", durationMinutes: 90 } };
const changed: ClientSchedulingEvent = { ...confirmed, id: "change-1", kind: "service_rescheduled", occurredAt: 2000,
  before: confirmed.after, after: { scheduledDate: "2030-01-03", startTime: "23:00", durationMinutes: 120 } };
const cancelled: ClientSchedulingEvent = { ...changed, id: "cancel-1", kind: "service_cancelled", occurredAt: 3000, before: undefined };
const request = (status = "scheduled", events = [changed, confirmed]) => ({ status, providerName: "Company", requestedAddOns: [], proposals: [], agreements: [],
  schedulingEvents: events, timelineFacts: { request: { status: "converted", submittedAt: 1 }, proposals: [], agreements: [],
    jobs: [{ status: status === "cancelled" ? "cancelled" : "confirmed", scheduledDate: "2030-01-03" }] } });
beforeEach(() => { state.language = "en"; });

describe("client scheduling communications presentation", () => {
  it.each(["en", "es"])("renders %s service updates, windows, timezone and accessible client routes", language => {
    state.language = language; const copy = language === "es" ? es : en;
    const html = renderToStaticMarkup(createElement(ClientServicesPresentation, { data: { current: [], upcoming: [], recent: [], schedulingUpdates: [cancelled, changed, confirmed] } }));
    expect(html).toContain(copy.clientScheduling.service_confirmed.label);
    expect(html).toContain(copy.clientScheduling.service_rescheduled.label);
    expect(html).toContain(copy.clientScheduling.service_cancelled.label);
    expect(html).toContain(copy.clientScheduling.previous); expect(html).toContain("America/New_York");
    expect(html).toContain("23:00–"); expect(html).toContain("01:00");
    expect(html).toContain('href="/client/requests/request-1"');
    expect(html).toContain("touch-target"); expect(html).toContain("break-words"); expect(html).toContain("focus:ring-2");
    expect(html).not.toContain('href="/jobs/'); expect(html).not.toContain('href="/manager/');
  });
  it("extends the timeline with stable event IDs without a second synthetic confirmation", () => {
    const events = deriveClientRequestTimeline(request());
    expect(events.map(event => event.id)).toContain("confirm-1");
    expect(events.map(event => event.id)).toContain("change-1");
    expect(events.some(event => event.kind === "scheduled")).toBe(false);
    const html = renderToStaticMarkup(createElement(ClientRequestTimeline, { request: request() }));
    expect(html).toContain(en.clientScheduling.service_rescheduled.label);
    expect(html).toContain('href="/client/services"');
  });
  it("presents company cancellation as terminal rather than awaiting a new confirmation", () => {
    const data = request("cancelled", [cancelled, changed, confirmed]);
    const event = deriveClientRequestTimeline(data).find(event => event.id === "cancel-1");
    expect(event?.state).toBe("terminal");
    const html = renderToStaticMarkup(createElement(ClientRequestDetailPresentation, { request: data }));
    expect(html).toContain(en.clientRequests.statusSummary.cancelled.meaning);
    expect(html).not.toContain(en.clientRequests.awaitingConfirmation);
    expect(html).toContain(en.clientScheduling.service_cancelled.label);
  });
  it("renders date-only changes and omits filtered updates", () => {
    const html = renderToStaticMarkup(createElement(ClientSchedulingUpdates, { events: [{ ...changed, after: { ...changed.after, startTime: undefined } }] }));
    expect(html).toContain(en.clientScheduling.timeUnknown);
    expect(renderToStaticMarkup(createElement(ClientSchedulingUpdates, { events: [] }))).toBe("");
  });
  it("keeps the EN/ES event and status structures aligned", () => {
    expect(Object.keys(en.clientScheduling).sort()).toEqual(Object.keys(es.clientScheduling).sort());
    expect(Object.keys(en.clientRequests.statusSummary.cancelled).sort()).toEqual(Object.keys(es.clientRequests.statusSummary.cancelled).sort());
  });
});
