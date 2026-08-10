export type ManagerJobScope = "all" | "my";

export function getEffectiveManagerJobScope(
  requestedScope: ManagerJobScope,
  canSeeAllJobs: boolean,
): ManagerJobScope {
  return canSeeAllJobs ? requestedScope : "my";
}

export function filterByManagerJobScope<T extends { isAssignedToCurrentUser?: boolean }>(
  items: T[],
  requestedScope: ManagerJobScope,
  canSeeAllJobs: boolean,
): T[] {
  return getEffectiveManagerJobScope(requestedScope, canSeeAllJobs) === "all"
    ? items
    : items.filter((item) => item.isAssignedToCurrentUser === true);
}
