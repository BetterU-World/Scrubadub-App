import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, vars?: any) => key === "invoices.serviceDate" ? `Service date: ${vars?.date}` : key, i18n: { language: "en" } }) }));
import { ClientBillingPresentation, ClientCheckoutReturnNotice } from "./ClientBillingPage";

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
  it.each(["failed", "expired"])("offers a useful retry after %s when allowed", paymentState => {
    const html = renderToStaticMarkup(createElement(ClientBillingPresentation, { data: { invoices: [{ ...invoice, paymentState, canPayOnline: true }] }, onPay: () => undefined }));
    expect(html).toContain("clientBilling.retryPayment");
    expect(html).toContain(paymentState === "failed" ? "clientBilling.attemptFailed" : "clientBilling.attemptExpired");
    expect(html).not.toContain("clientBilling.processingTitle");
  });
  it("never presents an ambiguous payment as an ordinary failure or a retry", () => {
    const html = renderToStaticMarkup(createElement(ClientBillingPresentation, { data: { invoices: [{ ...invoice, paymentState: "attention", paymentNeedsAttention: true, canPayOnline: false }] }, onPay: () => undefined }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("clientBilling.needsReview");
    expect(html).not.toMatch(/<button|clientBilling.attemptFailed|clientBilling.paidOnline/);
  });
  it.each(["online", "outside", null])("labels authoritative paid provenance %s", paymentSource => {
    const html = renderToStaticMarkup(createElement(ClientBillingPresentation, { data: { invoices: [{ ...invoice, status: "paid", paymentState: "paid", paymentSource }] }, onPay: () => undefined }));
    expect(html).toContain(paymentSource === "online" ? "clientBilling.paidOnline" : paymentSource === "outside" ? "clientBilling.paidOutside" : "clientBilling.paidConfirmed");
    expect(html).not.toContain("<button");
  });
  it("renders processing before reconciliation and confirmed paid afterward regardless of the return parameter", () => {
    const notice = renderToStaticMarkup(createElement(ClientCheckoutReturnNotice, { returnState: "processing" }));
    expect(notice).toContain("clientBilling.returnHelp");
    expect(notice).not.toMatch(/clientBilling.paid|Payment confirmed/);
    const render = (status: string, paymentState: string) => notice + renderToStaticMarkup(createElement(ClientBillingPresentation, { data: { invoices: [{ ...invoice, status, paymentState, paymentSource: "online" }] }, onPay: () => undefined }));
    expect(render("issued", "processing")).toContain("clientBilling.processingTitle");
    expect(render("issued", "processing")).not.toContain("clientBilling.paidOnline");
    expect(render("paid", "paid")).toContain("clientBilling.paidOnline");
    expect(render("paid", "paid")).not.toContain("clientBilling.processingTitle");
  });
  it("does not offer payment while online acceptance is unavailable", () => {
    const html = renderToStaticMarkup(createElement(ClientBillingPresentation, { data: { invoices: [{ ...invoice, paymentState: "expired", canPayOnline: false }] }, onPay: () => undefined }));
    expect(html).toContain("clientBilling.onlineUnavailable");
    expect(html).not.toContain("<button");
  });
});
