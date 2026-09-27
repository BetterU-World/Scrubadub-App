import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import en from "../../i18n/en/common.json";
import es from "../../i18n/es/common.json";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("convex/react", () => ({ useQuery: () => ({ state: "set_up", testCheckoutAvailable: false }), useAction: () => vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { _id: "owner" } }), getStaffSessionToken: () => "test-session" }));
vi.mock("@/components/ui/PageHeader", () => ({ PageHeader: () => null }));
vi.mock("@/components/ui/LoadingSpinner", () => ({ PageLoader: () => null }));
import { StripeConnectPage, StripeOnboardingHelp } from "./StripeConnectPage";

describe("Stripe onboarding explanation", () => {
  it("places the explanation before an enabled existing onboarding CTA", () => {
    vi.stubGlobal("window", { location: { search: "" } });
    const html = renderToStaticMarkup(createElement(StripeConnectPage));
    vi.unstubAllGlobals();
    expect(html.indexOf("companyConnect.onboardingPurpose")).toBeLessThan(html.indexOf("<button"));
    expect(html).toContain("companyConnect.continue");
    expect(html).not.toContain("disabled");
    const help = renderToStaticMarkup(createElement(StripeOnboardingHelp));
    for (const key of ["onboardingPurpose", "onboardingVerification", "onboardingPrivacy", "onboardingHaveReady"] as const) {
      expect(help).toContain(`companyConnect.${key}`);
      expect(en.companyConnect[key]).toBeTruthy();
      expect(es.companyConnect[key]).toBeTruthy();
      expect(es.companyConnect[key]).not.toBe(en.companyConnect[key]);
    }
    expect(en.companyConnect.onboardingVerification).toMatch(/verify.*identity and tax/);
    expect(en.companyConnect.onboardingPrivacy).toMatch(/directly with Stripe/);
    expect(en.companyConnect.onboardingPrivacy).toMatch(/few minutes.*return to SCRUB/);
    expect(en.companyConnect.onboardingHaveReady).toContain("bank account");
  });

  it("localizes pending state and unknown legacy fee in English and Spanish", () => {
    for (const locale of [en, es]) {
      expect(locale.clientBilling.processingTitle).toBeTruthy();
      expect(locale.clientBilling.processingDetail).toBeTruthy();
      expect(locale.invoices.paidOnlineFeeUnavailable).toBeTruthy();
    }
  });
});
