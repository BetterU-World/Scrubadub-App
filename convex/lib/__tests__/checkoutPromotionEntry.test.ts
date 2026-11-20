import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCheckoutSession } from "../../actions/billing";
import { createPublicCheckoutSession } from "../../actions/publicBilling";
import { getStripeClientOrNull } from "../stripe";
import { requireOwnerSession } from "../sessions";

vi.mock("../stripe", () => ({ getStripeClientOrNull: vi.fn() }));
vi.mock("../sessions", async (importOriginal) => ({
  ...await importOriginal<typeof import("../sessions")>(),
  requireOwnerSession: vi.fn(),
}));

const checkoutUrl = "https://checkout.stripe.test/session";
const stripe = {
  customers: { create: vi.fn() },
  prices: { retrieve: vi.fn() },
  checkout: { sessions: { create: vi.fn() } },
};
const checkoutArgs = { userId: "owner", sessionToken: "test-session", tier: "cleaning_owner", plan: "solo" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_URL", "https://scrub.example");
  vi.stubEnv("STRIPE_PRICE_SCRUB_SOLO", "price_solo");
  vi.mocked(getStripeClientOrNull).mockReturnValue(stripe as unknown as ReturnType<typeof getStripeClientOrNull>);
  stripe.customers.create.mockResolvedValue({ id: "cus_new" });
  stripe.prices.retrieve.mockResolvedValue({
    active: true, type: "recurring", recurring: { interval: "month", interval_count: 1 },
    billing_scheme: "per_unit", unit_amount: 3499, currency: "usd",
  });
  stripe.checkout.sessions.create.mockResolvedValue({ url: checkoutUrl });
});

afterEach(() => vi.unstubAllEnvs());

describe("existing Stripe subscription checkout promotion entry", () => {
  it.each(["2026-11-20", "2027-01-20", "2027-02-01"])(
    "leaves manual code entry and final discount validation to Stripe on %s",
    async (date) => {
      vi.setSystemTime(new Date(date));
      try {
        const url = await (createPublicCheckoutSession as any)._handler(
          { runQuery: vi.fn().mockResolvedValue(null) },
          { plan: "solo", email: "new@example.com", checkoutAttemptId: "test-attempt-0001" },
        );

        expect(url).toBe(checkoutUrl);
        const session = stripe.checkout.sessions.create.mock.calls[0][0];
        expect(session).toMatchObject({
          customer: "cus_new",
          mode: "subscription",
          line_items: [{ price: "price_solo", quantity: 1 }],
          allow_promotion_codes: true,
          subscription_data: { trial_period_days: 14 },
        });
        expect(session).not.toHaveProperty("discounts");
        expect(session.subscription_data).not.toHaveProperty("discounts");
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("routes existing accounts away from public checkout before any Stripe call", async () => {
    await expect((createPublicCheckoutSession as any)._handler(
      { runQuery: vi.fn().mockResolvedValue({ _id: "existing" }) },
      { plan: "solo", email: "existing@example.com", checkoutAttemptId: "test-attempt-0002" },
    )).rejects.toThrow("Please sign in instead");
    expect(getStripeClientOrNull).not.toHaveBeenCalled();
  });

  it("keeps manual entry available for an authenticated free-account owner", async () => {
    vi.mocked(requireOwnerSession).mockResolvedValue({ userId: "owner" } as never);
    const ctx = {
      runQuery: vi.fn().mockResolvedValue({ companyId: "company", role: "owner", stripeCustomerId: "cus_existing" }),
      runMutation: vi.fn(),
    };
    expect(await (createCheckoutSession as any)._handler(ctx, checkoutArgs)).toBe(checkoutUrl);
    expect(requireOwnerSession).toHaveBeenCalledWith(ctx, "test-session", "owner");
    const session = stripe.checkout.sessions.create.mock.calls[0][0];
    expect(session).toMatchObject({
      customer: "cus_existing",
      allow_promotion_codes: true,
      subscription_data: { trial_period_days: 14, metadata: { companyId: "company", ownerUserId: "owner" } },
    });
    expect(session).not.toHaveProperty("discounts");
    expect(session.subscription_data).not.toHaveProperty("discounts");
    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(ctx.runMutation).not.toHaveBeenCalled();
  });
});
