export type OwnerConnectState = "set_up" | "checking" | "continue_verification" | "action_needed" | "ready";

export function ownerConnectDisplayState(
  persistedState: OwnerConnectState | undefined,
  checking: boolean,
  refreshFailed: boolean,
): OwnerConnectState {
  return checking || refreshFailed ? "checking" : persistedState ?? "checking";
}

export function ownerConnectActionKey(state: OwnerConnectState): string {
  if (state === "set_up") return "companyConnect.states.set_up";
  if (state === "ready") return "companyConnect.manage";
  return "companyConnect.continue";
}
