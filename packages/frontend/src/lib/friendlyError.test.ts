import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import en from "../i18n/en/common.json";
import es from "../i18n/es/common.json";
import { isValidSignInEmail, toFriendlyMessage, toSignInMessage } from "./friendlyError";
import { compensationError } from "../components/payments/compensationErrors";

function translate(dictionary: Record<string, any>) {
  return (key: string) => key.split(".").reduce<any>((value, part) => value?.[part], dictionary) as string;
}

describe("shared-work denial presentation", () => {
  for (const [locale, dictionary] of [["en", en], ["es", es]] as const) {
    it.each([
      ["Your company Owner must accept this shared-work request before assignment or execution.", "sharedWork.pending"],
      ["This shared-work request was rejected. Operational changes are unavailable.", "sharedWork.rejected"],
      ["Shared work needs manual review. Contact your company Owner; existing work and financial evidence have been preserved.", "sharedWork.manualReview"],
    ])(`${locale}: renders safe translated operational and financial denials: %s`, (message, key) => {
      const t = translate(dictionary);
      const wrapped = new Error(`[CONVEX M(test)] Server Error: Uncaught Error: ${message}`);
      expect(toFriendlyMessage(wrapped, "fallback", t)).toBe(t(key));
      expect(compensationError(wrapped, t as any)).toBe(t(key));
      expect(toFriendlyMessage(wrapped)).not.toContain("Uncaught");
      // The feedback bridge may first strip the transport wrapper without a translator.
      expect(toFriendlyMessage(toFriendlyMessage(wrapped), "fallback", t)).toBe(t(key));
    });
  }
});

describe("sign-in error presentation", () => {
  it("validates email format before staff and client sign-in", () => {
    expect(isValidSignInEmail("invalid")).toBe(false);
    expect(isValidSignInEmail("missing@domain")).toBe(false);
    expect(isValidSignInEmail("user@example.com")).toBe(true);
  });
  for (const [locale, dictionary] of [["English", en], ["Spanish", es]] as const) {
    const t = translate(dictionary);
    it(`${locale}: staff and client credential failures are account-neutral`, () => {
      for (const backendMessage of ["Invalid email or password", "[CONVEX A(authActions:signIn)] Uncaught Error: Invalid email or password", "[CONVEX A(clientAuthActions:signIn)] Uncaught Error: Invalid email or password"]) {
        expect(toSignInMessage(new Error(backendMessage), t)).toBe(t("auth.incorrectCredentials"));
      }
      for (const action of ["authActions:signIn", "clientAuthActions:signIn"]) {
        const rejection = new ConvexError(`[CONVEX A(${action})] Server Error\n  Called by client`);
        (rejection as ConvexError<any>).data = { code: "INVALID_CREDENTIALS", message: "Invalid email or password" };
        expect(toSignInMessage(rejection, t)).toBe(t("auth.incorrectCredentials"));
        (rejection as ConvexError<any>).data = JSON.stringify({ code: "INVALID_CREDENTIALS", message: "Invalid email or password" });
        expect(toSignInMessage(rejection, t)).toBe(t("auth.incorrectCredentials"));
      }
    });
    it(`${locale}: rate limits and unexpected failures are safe`, () => {
      expect(toSignInMessage(new Error("Rate limit exceeded. Please wait a moment before trying again."), t)).toBe(t("errors.rateLimited"));
      const rateLimit = new ConvexError("[CONVEX A(authActions:signIn)] Server Error");
      (rateLimit as ConvexError<any>).data = "Rate limit exceeded. Please wait a moment before trying again.";
      expect(toSignInMessage(rateLimit, t)).toBe(t("errors.rateLimited"));
      (rateLimit as ConvexError<any>).data = JSON.stringify(JSON.stringify("Rate limit exceeded. Please wait a moment before trying again."));
      expect(toSignInMessage(rateLimit, t)).toBe(t("errors.rateLimited"));
      expect(toSignInMessage(new Error("[CONVEX] SQL secret stack trace"), t)).toBe(t("feedback.unexpectedError"));
    });
    it(`${locale}: known validation and unknown application errors`, () => {
      expect(toFriendlyMessage(new Error("Invalid email address"), t("feedback.unexpectedError"), t)).toBe(t("auth.invalidEmail"));
      expect(toFriendlyMessage(new Error("Sensitive backend detail"), t("feedback.unexpectedError"), t)).toBe(t("feedback.unexpectedError"));
    });
  }
});
