import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveOperationalEmailIdentity } from "../operationalEmailIdentity";

describe("email identity and reply routing", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM_EMAIL = "Legacy Name <notifications@scrubscrubscrub.com>";
    process.env.APP_URL = "https://app.scrub.test";
  });

  it("uses the authenticated mailbox with consistent platform and operational display names", async () => {
    const { getPlatformEmailHeaders, getOperationalEmailHeaders } = await import("../email");
    expect(getPlatformEmailHeaders()).toEqual({
      from: "SCRUB <notifications@scrubscrubscrub.com>",
    });
    expect(getOperationalEmailHeaders({
      companyName: "Clean Co\r\nBcc: attacker@example.test",
      replyTo: "operations@clean.test",
    })).toEqual({
      from: "SCRUB on behalf of Clean Co Bcc: attacker@example.test <notifications@scrubscrubscrub.com>",
      replyTo: "operations@clean.test",
    });
  });

  it("omits missing or invalid operational reply addresses safely", async () => {
    const { getOperationalEmailHeaders } = await import("../email");
    expect(getOperationalEmailHeaders({ companyName: "Clean Co" })).not.toHaveProperty("replyTo");
    expect(getOperationalEmailHeaders({ companyName: "Clean Co", replyTo: "bad\r\naddress" })).not.toHaveProperty("replyTo");
  });

  it("prefers company contact email, then the oldest active owner, and ignores disabled owners", async () => {
    const owners = [
      { role: "owner", status: "disabled", email: "disabled@clean.test", _creationTime: 1 },
      { role: "owner", status: "active", email: "owner@clean.test", _creationTime: 2 },
    ];
    const ctx = (company: Record<string, unknown>) => ({
      db: {
        get: async () => company,
        query: () => ({ withIndex: () => ({ collect: async () => owners }) }),
      },
    });
    await expect(resolveOperationalEmailIdentity(ctx({
      name: "Clean Co",
      contactEmail: "ops@clean.test",
    }), "company-id")).resolves.toEqual({ companyName: "Clean Co", replyTo: "ops@clean.test" });
    await expect(resolveOperationalEmailIdentity(ctx({ name: "Clean Co" }), "company-id"))
      .resolves.toEqual({ companyName: "Clean Co", replyTo: "owner@clean.test" });
  });

  it("classifies every transport sender explicitly", () => {
    const source = readFileSync(resolve(process.cwd(), "convex/lib/email.ts"), "utf8");
    const platform = [
      "sendPasswordResetEmail", "sendClientPasswordResetEmail", "sendStripeConnectInviteEmail",
      "sendSupportEmail", "sendAffiliateInviteEmail", "sendInviteEmail",
    ];
    const operational = [
      "sendProposalEmail", "sendServiceAgreementEmail", "sendJobAssignedEmail",
      "sendJobCompletedEmail", "sendJobApprovedEmail", "sendPartnerInviteEmail",
      "sendPartnerSharedJobEmail", "sendClientInviteEmail",
    ];
    const body = (name: string) => source.slice(source.indexOf(`function ${name}`), source.indexOf("\nexport ", source.indexOf(`function ${name}`) + 10));
    for (const name of platform) expect(body(name), name).toContain("getPlatformEmailHeaders");
    for (const name of operational) expect(body(name), name).toContain("getOperationalEmailHeaders");
  });
});
