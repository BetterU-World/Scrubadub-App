/** Check if a user has a specific manager permission flag. */
export function hasManagerPermission(
  user: { role: string; canSeeAllJobs?: boolean; canCreateJobs?: boolean; canAssignCleaners?: boolean; canRequestRework?: boolean; canApproveForms?: boolean; canManageSchedule?: boolean; canResolveRedFlags?: boolean },
  permission: "canSeeAllJobs" | "canCreateJobs" | "canAssignCleaners" | "canRequestRework" | "canApproveForms" | "canManageSchedule" | "canResolveRedFlags"
): boolean {
  if (user.role !== "manager") return false;
  return user[permission] === true;
}

/** Returns true if the user role is a worker type (cleaner or maintenance). */
export function isWorkerRole(role: string): boolean {
  return role === "cleaner" || role === "maintenance";
}
