import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("authenticated client requests UI contracts", () => {
  it("registers specific request routes before the detail parameter route", () => {
    const app = readFileSync("packages/frontend/src/App.tsx", "utf8");
    const newRoute = app.indexOf('path="/client/requests/new"');
    const detailRoute = app.indexOf('path="/client/requests/:requestId"');
    const listRoute = app.indexOf('path="/client/requests"');
    expect(newRoute).toBeGreaterThan(0);
    expect(newRoute).toBeLessThan(detailRoute);
    expect(detailRoute).toBeLessThan(listRoute);
  });

  it("keeps the form semantic, mobile friendly, idempotent, and explicit about confirmation", () => {
    const form = readFileSync("packages/frontend/src/pages/client/ClientRequestNewPage.tsx", "utf8");
    expect(form).toContain("<form");
    expect(form).toContain('htmlFor="request-provider"');
    expect(form).toContain('htmlFor="request-location"');
    expect(form).toContain('htmlFor="request-date"');
    expect(form).toContain('role="alert"');
    expect(form).toContain('className="btn-primary touch-target w-full sm:w-auto"');
    expect(form).toContain("idempotencyKey");
    expect(form).toContain("clientRequests.awaitingNotice");
  });

  it("ships matching English and Spanish request translation structures", () => {
    const en = JSON.parse(readFileSync("packages/frontend/src/i18n/en/common.json", "utf8"));
    const es = JSON.parse(readFileSync("packages/frontend/src/i18n/es/common.json", "utf8"));
    expect(Object.keys(es.clientRequests).sort()).toEqual(Object.keys(en.clientRequests).sort());
    expect(Object.keys(es.clientRequests.validation).sort()).toEqual(Object.keys(en.clientRequests.validation).sort());
    expect(Object.keys(es.clientRequests.statuses).sort()).toEqual(Object.keys(en.clientRequests.statuses).sort());
    expect(en.clientRequests.confirmationMessage).toContain("not yet a confirmed appointment");
    expect(es.clientRequests.confirmationMessage).toContain("aún no es una cita confirmada");
  });
});
