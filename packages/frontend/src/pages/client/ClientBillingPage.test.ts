import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, vars?: any) => key === "invoices.serviceDate" ? `Service date: ${vars?.date}` : key, i18n: { language: "en" } }) }));
import { ClientBillingPresentation } from "./ClientBillingPage";

describe("client billing invoice types", () => {
  it("shows Pay Online for both issued invoice types", () => {
    const invoice = { _id: "one", invoiceNumber: "INV-00001", title: "Service", status: "issued", totalCents: 17500, baseSubtotalCents: 15000, addOnSubtotalCents: 2500, providerName: "Provider", dueDate: "2030-01-01", addOnLineItems: [], serviceSnapshot: { scheduledDate: "2030-01-01" } };
    const residential = renderToStaticMarkup(createElement(ClientBillingPresentation, { data: { invoices: [{ ...invoice, invoiceType: "job" }] }, onPay: () => undefined }));
    expect(residential).toContain("Service date:");
    expect(residential).toContain("invoices.payOnline");
    const commercial = renderToStaticMarkup(createElement(ClientBillingPresentation, { data: { invoices: [{ ...invoice, invoiceType: "commercial" }] }, onPay: () => undefined }));
    expect(commercial).toContain("invoices.payOnline");
  });
});


describe("client billing payment processing", () => {
  const invoice = { _id: "pending", invoiceNumber: "INV-00002", status: "issued", totalCents: 2500, providerName: "Provider", invoiceType: "commercial" };
  it("replaces Pay Online with an accessible processing message", () => {
    const html = renderToStaticMarkup(createElement(ClientBillingPresentation, { data: { invoices: [{ ...invoice, paymentProcessing: true }] }, onPay: () => undefined }));
    expect(html).toContain('role="status"');
    expect(html).toContain("clientBilling.processingTitle");
    expect(html).toContain("clientBilling.processingDetail");
    expect(html).not.toContain("invoices.payOnline");
    expect(html).not.toContain("<button");
  });
  it("allows payment again after a terminal attempt and renders Paid without a payment action", () => {
    const render = (status: string) => renderToStaticMarkup(createElement(ClientBillingPresentation, { data: { invoices: [{ ...invoice, status, paymentProcessing: false }] }, onPay: () => undefined }));
    expect(render("issued")).toContain("invoices.payOnline");
    expect(render("issued")).not.toContain("clientBilling.processingTitle");
    expect(render("paid")).toContain("clientPresentation.statuses.paid");
    expect(render("paid")).not.toContain("<button");
  });
});
