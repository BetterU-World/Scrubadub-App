import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const requestDetail = read("packages/frontend/src/pages/owner/RequestDetailPage.tsx");

describe("request client invitation UI", () => {
  it("renders localized not-invited, pending, and active states with the right actions", () => {
    expect(requestDetail).toContain("clientPortalStatus");
    expect(requestDetail).toContain('clientPortalStatus !== "active"');
    expect(requestDetail).toContain('clientPortalStatus === "pending"');
    expect(requestDetail).toContain('t("requests.clientPortal.resendInvitation")');
    expect(requestDetail).toContain('t("requests.clientPortal.existingAccount")');
  });

  it("teaches the missing-email prerequisite and prevents duplicate sends", () => {
    expect(requestDetail).toContain("disabled={!request.requesterEmail?.trim() || sendingClientInvite}");
    expect(requestDetail).toContain('t("requests.clientPortal.missingEmail")');
    expect(requestDetail).toContain("if (sendingClientInvite) return");
    expect(requestDetail).toContain("loading={sendingClientInvite}");
  });

  it("uses a contained confirmation dialog and immediately reflects reactive server status", () => {
    expect(requestDetail).toContain("open={showClientInvite}");
    expect(requestDetail).toContain('t("requests.clientPortal.confirmRecipient")');
    expect(requestDetail).toContain('t("requests.clientPortal.access.proposals")');
    expect(requestDetail).toContain("w-full items-center justify-center");
    expect(requestDetail).toContain("inviteClientFromRequest");
  });

  it("keeps English and Spanish request portal keys in exact parity", () => {
    const en = JSON.parse(read("packages/frontend/src/i18n/en/common.json")).requests.clientPortal;
    const es = JSON.parse(read("packages/frontend/src/i18n/es/common.json")).requests.clientPortal;
    const keys = (value: any, prefix = ""): string[] => Object.entries(value).flatMap(([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return child && typeof child === "object" ? keys(child, path) : [path];
    });
    expect(keys(es).sort()).toEqual(keys(en).sort());
  });
});
