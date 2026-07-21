import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const detail = read("packages/frontend/src/pages/owner/WorkerDetailPage.tsx");

describe("worker operational role management UI", () => {
  it("offers exactly the supported roles from the owner worker detail page", () => {
    expect(detail).toContain('const OPERATIONAL_ROLES = ["cleaner", "maintenance", "manager"]');
    expect(detail).toContain("mutations.workers.changeOperationalRole");
    expect(detail).not.toContain('"owner", "cleaner", "maintenance", "manager"');
  });

  it("requires explicit confirmation, prevents duplicate submits, and contains mobile controls", () => {
    expect(detail).toContain("open={Boolean(confirmOperationalRole)}");
    expect(detail).toContain("loading={changingOperationalRole}");
    expect(detail).toContain("if (!confirmOperationalRole || changingOperationalRole) return");
    expect(detail).toContain("w-full flex-col gap-2 sm:w-auto sm:flex-row");
  });

  it("localizes role-management strings with exact English and Spanish parity", () => {
    const en = JSON.parse(read("packages/frontend/src/i18n/en/common.json")).employees.operationalRole;
    const es = JSON.parse(read("packages/frontend/src/i18n/es/common.json")).employees.operationalRole;
    const keys = (value: any, prefix = ""): string[] => Object.entries(value).flatMap(([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return child && typeof child === "object" ? keys(child, path) : [path];
    });
    expect(keys(es).sort()).toEqual(keys(en).sort());
  });
});
