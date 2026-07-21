import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("commercial account lifecycle immediate-transition UI", () => {
  it("has no effective-date control and states immediate Pause/End semantics in EN and ES", () => {
    const component = readFileSync(fileURLToPath(new URL("./CommercialAccountLifecycleDialog.tsx", import.meta.url)), "utf8");
    const en = JSON.parse(readFileSync(fileURLToPath(new URL("../../i18n/en/common.json", import.meta.url)), "utf8"));
    const es = JSON.parse(readFileSync(fileURLToPath(new URL("../../i18n/es/common.json", import.meta.url)), "utf8"));

    expect(component).not.toMatch(/effectiveDate|type="date"/);
    expect(en.commercialAccounts.lifecycle).not.toHaveProperty("effectiveDate");
    expect(es.commercialAccounts.lifecycle).not.toHaveProperty("effectiveDate");
    expect(en.commercialAccounts.lifecycle.pause.description).toMatch(/takes effect immediately/i);
    expect(en.commercialAccounts.lifecycle.end.description).toMatch(/takes effect immediately and is permanent/i);
    expect(es.commercialAccounts.lifecycle.pause.description).toMatch(/inmediatamente/i);
    expect(es.commercialAccounts.lifecycle.end.description).toMatch(/inmediatamente/i);
  });
});
