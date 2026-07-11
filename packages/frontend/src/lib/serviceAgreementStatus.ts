export type ServiceAgreementPresentationStatus =
  | "not_created"
  | "draft"
  | "ready"
  | "sent"
  | "accepted"
  | "declined"
  | "cancelled";

export type ServiceAgreementStatusSource = {
  status?: string;
  readyAt?: number;
  sentAt?: number;
  signedAt?: number;
  cancelledAt?: number;
  declinedAt?: number;
} | null | undefined;

export function getServiceAgreementPresentationStatus(
  agreement: ServiceAgreementStatusSource
): ServiceAgreementPresentationStatus {
  if (!agreement) return "not_created";
  if (agreement.declinedAt != null) return "declined";
  if (agreement.status === "signed" || agreement.signedAt != null) return "accepted";
  if (agreement.status === "cancelled" || agreement.cancelledAt != null) return "cancelled";
  if (agreement.status === "sent" || agreement.sentAt != null) return "sent";
  if (agreement.status === "ready" || agreement.readyAt != null) return "ready";
  return "draft";
}
