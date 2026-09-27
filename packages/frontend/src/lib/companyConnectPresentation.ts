export type OwnerConnectState = "set_up" | "reconnect_required" | "payments_paused" | "checking" | "continue_verification" | "action_needed" | "ready";

export function ownerConnectDisplayState(
  persistedState: OwnerConnectState | undefined,
  checking: boolean,
  refreshFailed: boolean,
): OwnerConnectState {
  return checking || refreshFailed ? "checking" : persistedState ?? "checking";
}

export function ownerConnectActionKey(state: OwnerConnectState): string {
  if (state === "set_up") return "companyConnect.states.set_up";
  if (state === "reconnect_required") return "companyConnect.reconnect";
  if (state === "payments_paused") return "companyConnect.manage";
  if (state === "ready") return "companyConnect.manage";
  return "companyConnect.continue";
}
