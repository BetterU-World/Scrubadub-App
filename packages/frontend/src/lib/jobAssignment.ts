import type { Id } from "../../../../convex/_generated/dataModel";

type Assignment = { cleanerIds: readonly string[]; assignedTeamId?: string };
/** Only explicit source changes are serialized on edit. Never clear the opposite source. */
export function assignmentPayload(canAssign: boolean, workers: string[], teamId: string, previous?: Assignment, partner = false) {
  if (partner || !canAssign) return previous ? {} : { cleanerIds: [] as Id<"users">[] };
  const cleanerIds = [...new Set(workers)] as Id<"users">[];
  if (!previous) return { cleanerIds, ...(teamId ? { assignedTeamId: teamId as Id<"teams"> } : {}) };
  const oldIds = new Set(previous.cleanerIds);
  const directChanged = oldIds.size !== cleanerIds.length || cleanerIds.some(id => !oldIds.has(id));
  return {
    ...(directChanged ? { cleanerIds } : {}),
    ...(teamId !== (previous.assignedTeamId ?? "") ? teamId ? { assignedTeamId: teamId as Id<"teams"> } : { clearAssignedTeam: true } : {}),
  };
}
