export type ServiceAgreementPresentationStatus =
  | "not_created"
  | "draft"
  | "ready"
  | "sent"
  | "acknowledged"
  | "signed_received"
  | "declined"
  | "cancelled";

export type ServiceAgreementStatusSource = {
  status?: string;
  readyAt?: number;
  sentAt?: number;
  signedAt?: number;
  clientRespondedAt?: number;
  cancelledAt?: number;
  declinedAt?: number;
} | null | undefined;

export function getServiceAgreementPresentationStatus(
  agreement: ServiceAgreementStatusSource
): ServiceAgreementPresentationStatus {
  if (!agreement) return "not_created";
  if (agreement.declinedAt != null) return "declined";
  if (agreement.signedAt != null) return "signed_received";
  if (agreement.status === "signed" || agreement.clientRespondedAt != null) return "acknowledged";
  if (agreement.status === "cancelled" || agreement.cancelledAt != null) return "cancelled";
  if (agreement.status === "sent" || agreement.sentAt != null) return "sent";
  if (agreement.status === "ready" || agreement.readyAt != null) return "ready";
  return "draft";
}
