export type AgreementPortalAccessStatus =
  | "ready"
  | "relationship_missing"
  | "relationship_inactive"
  | "recipient_email_missing"
  | "not_invited"
  | "invitation_pending"
  | "client_user_inactive"
  | "recipient_mismatch";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** An agreement email links to authenticated Client Portal content, not a public token. */
export async function serviceAgreementPortalAccess(ctx: any, agreement: any) {
  const relationship = agreement.clientRelationshipId
    ? await ctx.db.get(agreement.clientRelationshipId)
    : null;
  const request = agreement.clientRequestId
    ? await ctx.db.get(agreement.clientRequestId)
    : null;
  const recipientEmail = (
    relationship?.companyId === agreement.companyId ? relationship.email : undefined
  )?.trim().toLowerCase() || (
    request?.companyId === agreement.companyId ? request.requesterEmail : undefined
  )?.trim().toLowerCase() || null;
  const clientUser = relationship?.companyId === agreement.companyId && relationship.clientUserId
    ? await ctx.db.get(relationship.clientUserId)
    : null;

  let status: AgreementPortalAccessStatus;
  if (!relationship || relationship.companyId !== agreement.companyId) status = "relationship_missing";
  else if (relationship.status !== "active") status = "relationship_inactive";
  else if (!recipientEmail || !EMAIL_PATTERN.test(recipientEmail)) status = "recipient_email_missing";
  else if (clientUser?.status === "active") {
    status = clientUser.email?.trim().toLowerCase() === recipientEmail
      ? "ready"
      : "recipient_mismatch";
  } else if (relationship.inviteTokenHash || relationship.pendingInviteClientUserId || clientUser?.status === "pending") {
    status = "invitation_pending";
  } else status = relationship.clientUserId ? "client_user_inactive" : "not_invited";

  return {
    status,
    canEmail: status === "ready",
    recipientEmail,
    recipientEmailAvailable: Boolean(recipientEmail && EMAIL_PATTERN.test(recipientEmail)),
    relationshipActive: relationship?.companyId === agreement.companyId && relationship.status === "active",
    activeClientUserLinked: clientUser?.status === "active",
    invitationPending: status === "invitation_pending",
  };
}

export function requireAgreementEmailAccess(access: Awaited<ReturnType<typeof serviceAgreementPortalAccess>>) {
  if (access.canEmail) return;
  throw new Error("Active Client Portal access for the agreement email recipient is required before SCRUB can email this agreement");
}
