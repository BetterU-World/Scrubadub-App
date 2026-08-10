/** Check if a user has a specific manager permission flag. */
export function hasManagerPermission(
  user: { role: string; canSeeAllJobs?: boolean; canCreateJobs?: boolean; canAssignCleaners?: boolean; canRequestRework?: boolean; canApproveForms?: boolean; canManageSchedule?: boolean; canResolveRedFlags?: boolean; canManageBusinessConfiguration?: boolean },
  permission: "canSeeAllJobs" | "canCreateJobs" | "canAssignCleaners" | "canRequestRework" | "canApproveForms" | "canManageSchedule" | "canResolveRedFlags" | "canManageBusinessConfiguration"
): boolean {
  if (user.role !== "manager") return false;
  return user[permission] === true;
}

export function canManageBusinessConfiguration(user: {
  role: string;
  canManageBusinessConfiguration?: boolean;
}): boolean {
  return user.role === "owner" || (
    user.role === "manager" && user.canManageBusinessConfiguration === true
  );
}

export function hasOwnerOrManagerPermission(
  user: Parameters<typeof hasManagerPermission>[0],
  permission: Parameters<typeof hasManagerPermission>[1],
): boolean {
  return user.role === "owner" || hasManagerPermission(user, permission);
}

/** Returns true if the user role is a worker type (cleaner or maintenance). */
export function isWorkerRole(role: string): boolean {
  return role === "cleaner" || role === "maintenance";
}
