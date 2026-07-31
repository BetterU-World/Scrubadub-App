export const ASSESSMENT_CLEANUP_CONFIRMATION = "DELETE_DUPLICATE_ASSESSMENTS";

type CurrentDryRun<Id> = {
  blocked: boolean;
  proposedDeletionIds: Id[];
};

export function canConfirmAssessmentCleanup<Id>(dryRun: CurrentDryRun<Id> | null, phrase: string) {
  return Boolean(
    dryRun &&
    !dryRun.blocked &&
    dryRun.proposedDeletionIds.length > 0 &&
    phrase === ASSESSMENT_CLEANUP_CONFIRMATION
  );
}

export function approvedIdsFromLatestDryRun<Id>(dryRun: CurrentDryRun<Id>) {
  return [...dryRun.proposedDeletionIds];
}
