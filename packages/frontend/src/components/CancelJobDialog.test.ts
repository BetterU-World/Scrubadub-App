import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("cancellation UI contract", () => {
  it("keeps required reason, Other notes validation, responsive shell, and localized strings", () => {
    const root = process.cwd();
    const dialog = readFileSync(resolve(root, "packages/frontend/src/components/CancelJobDialog.tsx"), "utf8");
    const shell = readFileSync(resolve(root, "packages/frontend/src/components/ui/DialogShell.tsx"), "utf8");
    const en = JSON.parse(readFileSync(resolve(root, "packages/frontend/src/i18n/en/common.json"), "utf8"));
    const es = JSON.parse(readFileSync(resolve(root, "packages/frontend/src/i18n/es/common.json"), "utf8"));
    expect(dialog).toContain('reason === "other"');
    expect(dialog).toContain("!needsNotes || Boolean(notes.trim())");
    expect(dialog).toContain('role="alert"');
    expect(dialog).toContain("catch (cause)");
    expect(shell).toContain("max-h-[calc(100dvh");
    expect(Object.keys(en.jobs.cancelReasons)).toEqual(Object.keys(es.jobs.cancelReasons));
    expect(en.jobs.cancelJobExplanation).toBeTruthy();
    expect(es.jobs.cancelJobExplanation).toBeTruthy();
    const managerList = readFileSync(resolve(root, "packages/frontend/src/pages/manager/ManagerJobListPage.tsx"), "utf8");
    expect(managerList).toContain('t("status.cancelled")');
  });
});
