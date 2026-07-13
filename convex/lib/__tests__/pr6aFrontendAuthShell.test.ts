import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

function frontendSource(path: string) {
  return readFileSync(new URL(`../../../packages/frontend/src/${path}`, import.meta.url), "utf8");
}

describe("Security V2 PR 6A frontend authentication shell", () => {
  it("hydrates staff and Client principals from session tokens with exact skip branches", () => {
    const staffHook = frontendSource("hooks/useAuth.ts");
    const clientHook = frontendSource("hooks/useClientAuth.ts");
    expect(staffHook).toContain('sessionToken ? { sessionToken } : "skip"');
    expect(clientHook).toContain('sessionToken ? { sessionToken } : "skip"');
    expect(staffHook).not.toContain("getStoredStaffUserId");
    expect(clientHook).not.toContain("getStoredClientUserId");
  });

  it("guards the authenticated shell with the verified principal and tokenized billing query", () => {
    const app = frontendSource("App.tsx");
    expect(app).toContain("if (!isAuthenticated)");
    expect(app).toContain("? { companyId: user.companyId, sessionToken }");
    expect(app).not.toContain("scrubadub_userId");
    expect(app).not.toContain("storedUserId");
  });

  it("establishes invite and post-checkout sessions without persisting identity IDs", () => {
    const staffInvite = frontendSource("pages/auth/AcceptInvitePage.tsx");
    const checkoutSetup = frontendSource("pages/public/PostCheckoutSetupPage.tsx");
    const clientInvite = frontendSource("pages/client/ClientAcceptInvitePage.tsx");
    expect(staffInvite).toContain("localStorage.setItem(STAFF_SESSION_KEY, result.sessionToken)");
    expect(checkoutSetup).toContain("localStorage.setItem(STAFF_SESSION_KEY, result.sessionToken)");
    expect(clientInvite).toContain("setSignedInClient(result.sessionToken)");
    expect(staffInvite + checkoutSetup).not.toContain("scrubadub_userId");
    expect(clientInvite).not.toContain("scrubadub_clientUserId");
  });
});
