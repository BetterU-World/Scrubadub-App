import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Giveaway operator page", () => {
  it("is a superadmin-only admin route with private paginated data", () => {
    const app = read("packages/frontend/src/App.tsx");
    const page = read("packages/frontend/src/pages/admin/GiveawayOperatorPage.tsx");
    const navigation = read("packages/frontend/src/components/layout/navigation.ts");
    expect(app.indexOf("user?.isSuperadmin === true")).toBeLessThan(app.indexOf('path="/admin/giveaways"'));
    expect(navigation).toContain('href: "/admin/giveaways"');
    expect(page).toContain("api.giveaways.operatorSummary");
    expect(page).toContain("api.giveaways.entrants");
    expect(page).toContain("Private giveaway administration data");
    expect(page).toContain("Load all entrants before exporting the combined drawing pool.");
  });

  it("keeps Assessment answers and scores out of the operator UI", () => {
    const page = read("packages/frontend/src/pages/admin/GiveawayOperatorPage.tsx");
    expect(page).not.toMatch(/operationsScore|answerValue|completionSnapshot/);
    expect(page).toContain("Assessment answers and scores are intentionally unavailable here.");
    expect(page).toContain("marketingConsent");
  });
});
