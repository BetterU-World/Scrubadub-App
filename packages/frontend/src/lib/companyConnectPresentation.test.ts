import { describe, expect, it } from "vitest";
import { ownerConnectActionKey, ownerConnectDisplayState } from "./companyConnectPresentation";

describe("owner company Connect presentation", () => {
  it("never treats the Stripe return or a failed refresh as proof of readiness", () => {
    expect(ownerConnectDisplayState("ready", true, false)).toBe("checking");
    expect(ownerConnectDisplayState("ready", false, true)).toBe("checking");
    expect(ownerConnectDisplayState("ready", false, false)).toBe("ready");
  });

  it("offers setup, continuation, or management for each state", () => {
    expect(ownerConnectActionKey("set_up")).toBe("companyConnect.states.set_up");
    for (const state of ["checking", "continue_verification", "action_needed"] as const) {
      expect(ownerConnectActionKey(state)).toBe("companyConnect.continue");
    }
    expect(ownerConnectActionKey("ready")).toBe("companyConnect.manage");
  });
});
