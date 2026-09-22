import { beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => vi.fn(async (_message: unknown) => ({ error: null })));
vi.mock("resend", () => ({ Resend: class { emails = { send: sent }; } }));

import { sendProposalEmail } from "../email";

beforeEach(() => {
  sent.mockClear();
  process.env.APP_URL = "https://scrub.example.com";
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.RESEND_FROM_EMAIL = "test@example.com";
  delete process.env.SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS;
});

describe("proposal email boundary", () => {
  it("renders proposal-owned scope, pricing, and add-ons without an assessment summary", async () => {
    const ok = await sendProposalEmail({
      email: "client@example.com", viewUrl: "https://scrub.example.com/proposal/token",
      companyName: "Company", clientName: "Client",
      proposal: {
        title: "Reviewed proposal", scopeOfWork: "Reviewed scope", monthlyPriceLabel: "$123.45",
        addOnLineItems: [{ name: "Reviewed add-on", pricingMethod: "flat", billingCadence: "monthly", lineTotalLabel: "$10.00" }],
      },
    });
    expect(ok).toBe(true);
    const html = sent.mock.calls[0][0].html;
    expect(html).toContain("Reviewed scope");
    expect(html).toContain("$123.45");
    expect(html).toContain("Reviewed add-on");
    expect(html).not.toContain("Walkthrough summary");
  });
});
