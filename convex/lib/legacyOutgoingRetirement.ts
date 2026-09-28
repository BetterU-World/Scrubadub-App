/** Legacy creation is permanently retired; historical completion remains separate.
 * Never gate this on invoice settings or use these records as V2 obligations. */
export const LEGACY_OUTGOING_RETIRED =
  "Legacy outgoing payments are retired. Payment recording is being upgraded.";
export function retireLegacyOutgoing(): never {
  throw new Error(LEGACY_OUTGOING_RETIRED);
}
