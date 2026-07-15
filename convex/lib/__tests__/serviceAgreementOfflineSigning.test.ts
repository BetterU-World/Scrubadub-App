import { beforeEach, describe, expect, it, vi } from "vitest";

describe("service agreement offline signing clarity", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.APP_URL = "https://app.scrub.test";
  });

  async function render(overrides: Record<string, unknown> = {}) {
    const { renderServiceAgreementEmail } = await import("../email");
    return renderServiceAgreementEmail({
      email: "client@example.test",
      viewUrl: "https://app.scrub.test/client/login?next=%2Fclient%2Fservice-agreements%2Fagreement-1",
      companyName: "Clean & Safe <Co>",
      companyEmail: "agreements@clean.test",
      clientName: "Client",
      agreement: { title: "Service <Agreement>", propertyAddress: "1 Main St" },
      ...overrides,
    });
  }

  it("explains offline signing, contact return, CTA, and fallback URL", async () => {
    const message = await render();
    expect(message.html).toContain("does not provide electronic signing");
    expect(message.html).toContain("print it, sign it, and return the signed copy");
    expect(message.html).toContain("agreements@clean.test");
    expect(message.html).toContain("Review Agreement");
    expect(message.html).toContain("If the button does not work");
    expect(message.text).toContain("https://app.scrub.test/client/login?next=");
    expect(message.html).toContain("Clean &amp; Safe &lt;Co&gt;");
    expect(message.html).toContain("Service &lt;Agreement&gt;");
  });

  it("omits an unavailable company email and renders Spanish parity", async () => {
    const message = await render({ companyEmail: undefined, language: "es" });
    expect(message.html).toContain("no ofrece firma electrónica");
    expect(message.html).toContain("imprímelo, fírmalo");
    expect(message.html).toContain("Revisar acuerdo");
    expect(message.html).not.toContain("agreements@clean.test");
    expect(message.text).toContain("https://app.scrub.test/client/login?next=");
  });
});
