export function isOptionalAgreementSetupAction(key: string): boolean {
  return key === "acknowledged_continue_setup" || key === "signed_received_continue_setup";
}
