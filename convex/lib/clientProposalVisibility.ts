const CLIENT_VISIBLE_PROPOSAL_STATUSES = new Set(["sent", "accepted", "declined"]);

export function isClientVisibleProposal(proposal: { status: string }) {
  return CLIENT_VISIBLE_PROPOSAL_STATUSES.has(proposal.status);
}
