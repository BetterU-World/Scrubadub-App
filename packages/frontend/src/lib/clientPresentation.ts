export type ClientPresentationEntity = "job" | "invoice" | "proposal";

const statusKeys: Record<ClientPresentationEntity, Record<string, string>> = {
  job: {
    scheduled: "scheduled",
    confirmed: "confirmed",
    denied: "cancelled",
    in_progress: "inProgress",
    submitted: "completed",
    approved: "completed",
    rework_requested: "inProgress",
    cancelled: "cancelled",
  },
  invoice: {
    draft: "preparing",
    issued: "due",
    paid: "paid",
    void: "noLongerDue",
  },
  proposal: {
    draft: "preparing",
    sent: "reviewNeeded",
    accepted: "accepted",
    declined: "declined",
  },
};

/** Returns a translation key for client-safe status language. */
export function getClientStatusTranslationKey(
  entity: ClientPresentationEntity,
  status: string | null | undefined
) {
  const presentationStatus = status ? statusKeys[entity][status] : undefined;
  return presentationStatus
    ? `clientPresentation.statuses.${presentationStatus}`
    : "clientPresentation.statuses.unavailable";
}
