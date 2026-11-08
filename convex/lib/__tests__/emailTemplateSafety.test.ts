import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";

const sent = vi.hoisted(() => vi.fn(async (_message: {
  html: string; to: string; subject: string; replyTo?: string;
}) => ({ error: null })));
vi.mock("resend", () => ({ Resend: class { emails = { send: sent }; } }));

import {
  sendJobAssignedEmail, sendJobCompletedEmail, sendJobApprovedEmail,
  sendSupportEmail, sendAffiliateInviteEmail, sendPartnerInviteEmail,
  sendInviteEmail, sendClientInviteEmail, sendStripeConnectInviteEmail,
  sendPasswordResetEmail, sendClientPasswordResetEmail,
  renderPartnerSharedJobEmail, renderServiceAgreementEmail, renderInvoiceEmail,
} from "../email";

const name = `O'Brien & "Sons" <img data-injected="yes" src=x>`;
const escapedName = "O&#39;Brien &amp; &quot;Sons&quot; &lt;img data-injected=&quot;yes&quot; src=x&gt;";
const recipient = "worker@example.com";

beforeEach(() => {
  sent.mockClear();
  vi.stubEnv("APP_URL", "https://scrub.example.com");
  vi.stubEnv("RESEND_API_KEY", "test-resend-key");
  vi.stubEnv("RESEND_FROM_EMAIL", "test@example.com");
  vi.stubEnv("SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS", "false");
});

afterEach(() => vi.unstubAllEnvs());

function assertLiteralName(html: string) {
  expect(html).toContain(escapedName);
  expect(html).not.toContain("O&amp;#39;Brien");
  const document = new JSDOM(html).window.document;
  expect(document.body.textContent).toContain(name);
  expect(document.querySelector("[data-injected]")).toBeNull();
  return document;
}

async function messageAfter(send: () => Promise<unknown>) {
  await send();
  expect(sent).toHaveBeenCalledTimes(1);
  return sent.mock.calls[0][0];
}

describe("operational email HTML safety", () => {
  it.each([
    ["assignment", () => sendJobAssignedEmail(recipient, name, "2030-01-02", "10:00")],
    ["completion property", () => sendJobCompletedEmail(recipient, name, "Cleaner", 1_800_000_000_000)],
    ["completion cleaner", () => sendJobCompletedEmail(recipient, "Property", name, 1_800_000_000_000)],
    ["approval", () => sendJobApprovedEmail(recipient, name)],
    ["affiliate invitation", () => sendAffiliateInviteEmail(recipient, "token", name)],
    ["worker invitation", () => sendInviteEmail(recipient, "token", name)],
    ["client invitation", () => sendClientInviteEmail(recipient, "token", name)],
    ["partner invitation", () => sendPartnerInviteEmail(recipient, name)],
    ["legacy connect invitation", () => sendStripeConnectInviteEmail(recipient, name)],
  ] as const)("renders %s names as literal text once", async (_label, send) => {
    const message = await messageAfter(send);
    const document = assertLiteralName(message.html);
    expect(message.to).toBe(recipient);
    expect(message.subject).not.toContain("&amp;");
    expect(document.querySelector("a")?.getAttribute("style")).toContain("background-color: #111");
  });

  it("escapes schedule values and preserves table markup", async () => {
    const message = await messageAfter(() => sendJobAssignedEmail(recipient, "Property", name, name));
    const document = assertLiteralName(message.html);
    expect(document.querySelectorAll("tr")).toHaveLength(2);
    expect(document.querySelectorAll("td")[3].textContent).toBe(`${name} at ${name}`);
  });

  it("preserves approval emphasis around the escaped property", async () => {
    const message = await messageAfter(() => sendJobApprovedEmail(recipient, name));
    expect(assertLiteralName(message.html).querySelector("strong")?.textContent).toBe(name);
  });

  it("escapes every support field while preserving headers and message newlines", async () => {
    const message = await messageAfter(() => sendSupportEmail(name, recipient, name, `${name}\nSecond line`));
    const document = assertLiteralName(message.html);
    expect(document.querySelectorAll("td")[1].textContent).toBe(name);
    expect(document.querySelectorAll("td")[3].textContent).toBe(recipient);
    expect(document.querySelectorAll("td")[5].textContent).toBe(name);
    expect(document.body.textContent).toContain(`${name}\nSecond line`);
    expect(message.replyTo).toBe(recipient);
    expect(message.subject).toBe(`[Contact Form] ${name}`);
  });

  it("escapes the support email address when displayed as text", async () => {
    const message = await messageAfter(() => sendSupportEmail("Client", name, "Help", "Message"));
    assertLiteralName(message.html);
    expect(message.replyTo).toBe(name);
  });

  it.each([
    ["staff reset", "/reset-password/", sendPasswordResetEmail],
    ["client reset", "/client/reset-password/", sendClientPasswordResetEmail],
    ["worker invite", "/invite/", sendInviteEmail],
    ["affiliate invite", "/invite/", sendAffiliateInviteEmail],
    ["client invite", "/client/accept-invite/", sendClientInviteEmail],
  ] as const)("keeps %s links inside their quoted attribute", async (_label, path, send) => {
    const token = `token" data-injected="yes&part='value'<tag>`;
    const message = await messageAfter(() => send(recipient, token));
    const document = new JSDOM(message.html).window.document;
    expect(document.querySelector("[data-injected]")).toBeNull();
    expect(document.querySelector("a")?.getAttribute("href")).toBe(`https://scrub.example.com${path}${token}`);
    expect(message.html).toContain("&quot;");
    expect(message.html).not.toContain("&amp;quot;");
  });

  it("escapes configured URLs at the HTML boundary without changing their values", async () => {
    const base = `https://scrub.example.com/path?one="quoted"&two='value'`;
    vi.stubEnv("APP_URL", base);
    const message = await messageAfter(() => sendJobAssignedEmail(recipient, "Property", "2030-01-02"));
    const document = new JSDOM(message.html).window.document;
    expect(document.querySelector("a")?.getAttribute("href")).toBe(base);
    expect(document.querySelector("img")?.getAttribute("src")).toBe(`${base}/logo-icon.png`);
    expect(message.html).toContain("&amp;two=&#39;value&#39;");
  });

  it("leaves already escaped shared-job content and intentional line breaks intact", () => {
    const rendered = renderPartnerSharedJobEmail({
      email: recipient, fromCompanyName: name, toCompanyName: name, propertyName: name,
      serviceType: "standard", scheduledDate: "2030-01-02", durationMinutes: 60,
      notes: `${name}\nSecond line`, copiedJobId: "job", timezone: "America/New_York",
    });
    const document = assertLiteralName(rendered.html);
    expect(document.querySelector("strong")).not.toBeNull();
    expect(rendered.html).toContain(`${escapedName}<br />Second line`);
    expect(rendered.text).toContain(name);
  });

  it("does not double escape existing agreement and invoice renderers", () => {
    const agreement = renderServiceAgreementEmail({
      email: recipient, viewUrl: "https://scrub.example.com/client?a=1&b=2",
      companyName: name, clientName: name, agreement: { title: name },
    });
    const invoice = renderInvoiceEmail({
      recipientEmail: recipient, clientName: name, companyName: name,
      viewUrl: "https://scrub.example.com/client?a=1&b=2",
      invoice: { invoiceNumber: name, title: name, dueDate: "2030-01-02", baseSubtotalCents: 100,
        addOnSubtotalCents: 0, totalCents: 100, addOnLineItems: [] },
    });
    for (const rendered of [agreement, invoice]) {
      const document = assertLiteralName(rendered.html);
      expect(document.querySelector("a")?.getAttribute("href")).toBe("https://scrub.example.com/client?a=1&b=2");
      expect(rendered.text).not.toContain("&amp;");
    }
  });
});
