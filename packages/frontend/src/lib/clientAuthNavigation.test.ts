import { describe, expect, it } from "vitest";
import { clientLoginDestination, isClientAuthPath } from "./clientAuthNavigation";

describe("client return navigation", () => {
  it.each([null, "https://other.invalid/client/home", "//other.invalid/client/home", "/jobs", "/client/../jobs", "/client/%2e%2e/jobs", "/client/\\other.invalid", "/client/login", "/client/login/", "/client/unknown", "/client/login?next=/client/home", "/client/forgot-password", "/client/reset-password/secret", "/client/accept-invite/secret", "/client/home\n"])("rejects unsafe or credential-entry destinations: %s", value => {
    expect(clientLoginDestination(value)).toBe("/client/home");
  });

  it.each(["/client/requests", "/client/requests/new", "/client/service-agreements/issued", "/client/billing?invoice_payment=processing#invoice"])("preserves a safe client destination: %s", value => {
    expect(clientLoginDestination(value)).toBe(value);
  });

  it("keeps invitation and password recovery public while treating portal data routes as protected", () => {
    expect(isClientAuthPath("/client/accept-invite/link")).toBe(true);
    expect(isClientAuthPath("/client/reset-password/link")).toBe(true);
    expect(isClientAuthPath("/client/documents")).toBe(false);
  });
});
