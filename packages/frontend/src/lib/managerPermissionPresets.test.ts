import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  deriveManagerProfile,
  emptyManagerPermissions,
  managerPermissionKeys,
  managerPermissionPresets,
  type ManagerPermissionKey,
  type ManagerPresetId,
} from "./managerPermissionPresets";

const enabled = (id: ManagerPresetId) => {
  const preset = managerPermissionPresets.find((candidate) => candidate.id === id)!;
  return managerPermissionKeys.filter((key) => preset.permissions[key]);
};

describe("Manager permission presets", () => {
  it.each<[ManagerPresetId, ManagerPermissionKey[]]>([
    ["fieldManager", ["canSeeAllJobs", "canRequestRework", "canApproveForms", "canResolveRedFlags"]],
    ["scheduler", ["canSeeAllJobs", "canCreateJobs", "canAssignCleaners", "canManageSchedule"]],
    ["officeManager", ["canManageBusinessConfiguration", "canManageClients", "canManageSalesAndCommercial", "canManageTeam", "canManageInvoices", "canManageDocuments"]],
    ["operationsManager", ["canSeeAllJobs", "canCreateJobs", "canAssignCleaners", "canRequestRework", "canApproveForms", "canManageSchedule", "canResolveRedFlags", "canManageBusinessConfiguration", "canManageClients", "canManageSalesAndCommercial", "canManageTeam", "canManageDocuments", "canViewAnalytics"]],
  ])("maps %s to exactly its canonical booleans", (id, expected) => {
    expect(enabled(id).sort()).toEqual([...expected].sort());
    expect(deriveManagerProfile(managerPermissionPresets.find((preset) => preset.id === id)!.permissions)).toBe(id);
  });

  it("keeps Operations Manager explicitly non-financial", () => {
    const operations = managerPermissionPresets.find((preset) => preset.id === "operationsManager")!.permissions;
    expect(operations.canViewFinancials).toBe(false);
    expect(operations.canManageInvoices).toBe(false);
  });

  it("derives Custom truthfully and re-derives an exact preset", () => {
    expect(deriveManagerProfile(emptyManagerPermissions)).toBe("custom");
    const scheduler = managerPermissionPresets.find((preset) => preset.id === "scheduler")!.permissions;
    expect(deriveManagerProfile({ ...scheduler, canResolveRedFlags: true })).toBe("custom");
    expect(deriveManagerProfile({ ...scheduler })).toBe("scheduler");
  });

  it("applies profiles locally and persists only canonical permission booleans", () => {
    const editor = readFileSync("packages/frontend/src/pages/owner/EmployeeListPage.tsx", "utf8");
    expect(editor).toContain("onClick={() => setEditPerms({ ...preset.permissions })}");
    expect(editor).toContain("...editPerms");
    expect(editor).not.toContain("managerPreset:");
    expect(editor).not.toContain("managerProfile:");
  });
});
