import { describe, expect, it } from "vitest";
import { parseMoney } from "./compensationMoney";

describe("compensation money input", () => {
  it.each([
    ["0", 0],
    ["120", 12000],
    ["0.01", 1],
    ["90.5", 9050],
    ["90,50", 9050],
    [" 120.00 ", 12000],
    ["10000000000.00", 1_000_000_000_000],
  ])("converts %s to exact minor units", (input, expected) => {
    expect(parseMoney(String(input))).toBe(expected);
  });
  it.each([
    "",
    "-20",
    "1.005",
    "1,234",
    "1,200.00",
    "1e4",
    "Infinity",
    "10000000000.01",
    "9999999999999999999",
    ".50",
    "20abc",
  ])("rejects ambiguous or unsafe amount %s", (input) => {
    expect(parseMoney(input)).toBeNull();
  });
});
