import { describe, it, expect } from "vitest";

/**
 * Unit tests for subscription gating logic.
 * Since requireActiveSubscription reads from Convex DB, we test the rules
 * as pure functions here to verify the logic without a live backend.
 */

const PAST_DUE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

type SubStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "paused"
  | undefined;

function checkGating(
  status: SubStatus,
  currentPeriodEnd?: number,
  now = Date.now()
): boolean {
  // Mirror the logic in subscriptionGating.ts
  if (!status) return true; // no subscription → allow
  if (status === "active" || status === "trialing") return true;
  if (status === "past_due") {
    const periodEnd = currentPeriodEnd ?? 0;
    if (now < periodEnd + PAST_DUE_GRACE_MS) return true;
  }
  return false;
}

describe("subscription gating rules", () => {
  it("allows writes when no subscription (legacy/new company)", () => {
    expect(checkGating(undefined)).toBe(true);
  });

  it("allows writes for active subscriptions", () => {
    expect(checkGating("active")).toBe(true);
  });

  it("allows writes for trialing subscriptions", () => {
    expect(checkGating("trialing")).toBe(true);
  });

  it("allows writes for past_due within 3-day grace", () => {
    const periodEnd = Date.now(); // just ended
    expect(checkGating("past_due", periodEnd)).toBe(true);
  });

  it("blocks writes for past_due after 3-day grace", () => {
    const periodEnd = Date.now() - PAST_DUE_GRACE_MS - 1000; // expired 1s ago
    expect(checkGating("past_due", periodEnd)).toBe(false);
  });

  it("blocks writes for canceled subscriptions", () => {
    expect(checkGating("canceled")).toBe(false);
  });

  it("blocks writes for unpaid subscriptions", () => {
    expect(checkGating("unpaid")).toBe(false);
  });

  it("blocks writes for incomplete subscriptions", () => {
    expect(checkGating("incomplete")).toBe(false);
  });

  it("blocks writes for paused subscriptions", () => {
    expect(checkGating("paused")).toBe(false);
  });
});
