/** An empty amount is omitted; malformed amounts return null. */
export function parseOptionalCustomerChargeCents(value: string): number | undefined | null {
  const input = value.trim();
  if (!input) return undefined;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(input);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}
