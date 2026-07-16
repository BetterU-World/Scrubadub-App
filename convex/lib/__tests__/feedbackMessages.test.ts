import { describe, expect, it } from "vitest";
import en from "../../../packages/frontend/src/i18n/en/common.json";
import es from "../../../packages/frontend/src/i18n/es/common.json";
import { normalizeFeedbackMessage } from "../../../packages/frontend/src/lib/feedbackMessage";
import { toFriendlyMessage } from "../../../packages/frontend/src/lib/friendlyError";

const providerKeys = [
  "closeNotification",
  "success",
  "error",
  "warning",
  "info",
  "defaultSuccess",
  "defaultWarning",
  "defaultInfo",
  "unexpectedError",
] as const;

describe("shared feedback messages", () => {
  it("has human-readable provider copy in English and Spanish", () => {
    for (const key of providerKeys) {
      expect(en.feedback[key]).not.toBe(`feedback.${key}`);
      expect(es.feedback[key]).not.toBe(`feedback.${key}`);
      expect(en.feedback[key]).not.toMatch(/^[a-z0-9_-]+(?:\.[a-z0-9_-]+)+$/i);
      expect(es.feedback[key]).not.toMatch(/^[a-z0-9_-]+(?:\.[a-z0-9_-]+)+$/i);
    }
  });

  it("keeps the complete feedback namespace in locale parity", () => {
    expect(Object.keys(en.feedback).sort()).toEqual(Object.keys(es.feedback).sort());
  });

  it.each(["success.granted", "property.update.success", "FEEDBACK_SAVED"])(
    "does not expose the internal identifier %s",
    (identifier) => {
      expect(toFriendlyMessage(identifier)).toBe("Something went wrong. Please try again.");
    },
  );

  it("replaces implementation identifiers at the presentation boundary", () => {
    expect(normalizeFeedbackMessage("property.update.success", en.feedback.defaultSuccess))
      .toBe(en.feedback.defaultSuccess);
    expect(normalizeFeedbackMessage("Property updated successfully.", en.feedback.defaultSuccess))
      .toBe("Property updated successfully.");
  });
});
