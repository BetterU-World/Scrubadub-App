export const managerPermissionKeys = [
  "canSeeAllJobs",
  "canCreateJobs",
  "canAssignCleaners",
  "canRequestRework",
  "canApproveForms",
  "canManageSchedule",
  "canResolveRedFlags",
  "canManageBusinessConfiguration",
  "canManageClients",
  "canManageSalesAndCommercial",
  "canManageTeam",
  "canViewFinancials",
  "canManageInvoices",
  "canManageDocuments",
  "canViewAnalytics",
] as const;

export type ManagerPermissionKey = (typeof managerPermissionKeys)[number];
export type ManagerPermissions = Record<ManagerPermissionKey, boolean>;
export type ManagerPresetId = "fieldManager" | "scheduler" | "officeManager" | "operationsManager";
export type DerivedManagerProfile = ManagerPresetId | "custom";

function permissions(enabled: readonly ManagerPermissionKey[]): ManagerPermissions {
  const enabledSet = new Set<ManagerPermissionKey>(enabled);
  return Object.fromEntries(
    managerPermissionKeys.map((key) => [key, enabledSet.has(key)]),
  ) as ManagerPermissions;
}

export const managerPermissionPresets: ReadonlyArray<{
  id: ManagerPresetId;
  labelKey: string;
  descriptionKey: string;
  permissions: ManagerPermissions;
}> = [
  {
    id: "fieldManager",
    labelKey: "employees.managerProfiles.fieldManager.label",
    descriptionKey: "employees.managerProfiles.fieldManager.description",
    permissions: permissions(["canSeeAllJobs", "canRequestRework", "canApproveForms", "canResolveRedFlags"]),
  },
  {
    id: "scheduler",
    labelKey: "employees.managerProfiles.scheduler.label",
    descriptionKey: "employees.managerProfiles.scheduler.description",
    permissions: permissions(["canSeeAllJobs", "canCreateJobs", "canAssignCleaners", "canManageSchedule"]),
  },
  {
    id: "officeManager",
    labelKey: "employees.managerProfiles.officeManager.label",
    descriptionKey: "employees.managerProfiles.officeManager.description",
    permissions: permissions([
      "canManageClients",
      "canManageSalesAndCommercial",
      "canManageTeam",
      "canManageDocuments",
      "canManageInvoices",
      "canManageBusinessConfiguration",
    ]),
  },
  {
    id: "operationsManager",
    labelKey: "employees.managerProfiles.operationsManager.label",
    descriptionKey: "employees.managerProfiles.operationsManager.description",
    permissions: permissions([
      "canSeeAllJobs",
      "canCreateJobs",
      "canAssignCleaners",
      "canManageSchedule",
      "canRequestRework",
      "canApproveForms",
      "canResolveRedFlags",
      "canManageBusinessConfiguration",
      "canManageClients",
      "canManageSalesAndCommercial",
      "canManageTeam",
      "canManageDocuments",
      "canViewAnalytics",
    ]),
  },
];

export const emptyManagerPermissions = permissions([]);

export function deriveManagerProfile(current: ManagerPermissions): DerivedManagerProfile {
  return managerPermissionPresets.find((preset) =>
    managerPermissionKeys.every((key) => current[key] === preset.permissions[key])
  )?.id ?? "custom";
}
