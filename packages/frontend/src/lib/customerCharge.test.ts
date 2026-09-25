import { describe, expect, it } from "vitest";
import { parseOptionalCustomerChargeCents } from "./customerCharge";

describe("optional customer charge parsing", () => {
  it.each([
    ["", undefined], ["180", 18000], ["180.00", 18000], ["180.50", 18050],
    ["0", 0], ["0.01", 1], ["0.29", 29], [" 12.3 ", 1230],
  ])("parses %s as %s cents", (input, expected) => {
    expect(parseOptionalCustomerChargeCents(input)).toBe(expected);
  });

  it.each(["-1", "1.234", "1.", ".50", "1,000", "abc", "1e2", "90071992547409999"])("rejects %s", input => {
    expect(parseOptionalCustomerChargeCents(input)).toBeNull();
  });
});
