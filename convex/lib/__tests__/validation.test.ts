import { describe, it, expect } from "vitest";
import { validatePassword, validateEmail, validateName } from "../validation";

describe("validatePassword", () => {
  it("rejects passwords shorter than 10 characters", () => {
    expect(() => validatePassword("short")).toThrow("at least 10");
  });

  it("rejects empty passwords", () => {
    expect(() => validatePassword("")).toThrow("at least 10");
  });

  it("rejects passwords longer than 128 characters", () => {
    expect(() => validatePassword("a".repeat(129))).toThrow("at most 128");
  });

  it("accepts valid passwords", () => {
    expect(() => validatePassword("validpassword123")).not.toThrow();
  });
});

describe("validateEmail", () => {
  it("rejects empty emails", () => {
    expect(() => validateEmail("")).toThrow("Invalid email");
  });

  it("rejects emails without @", () => {
    expect(() => validateEmail("notanemail")).toThrow("Invalid email");
  });

  it("rejects emails over 254 chars", () => {
    expect(() => validateEmail("a".repeat(250) + "@b.co")).toThrow("Invalid email");
  });

  it("accepts valid emails", () => {
    expect(() => validateEmail("user@example.com")).not.toThrow();
  });
});

describe("validateName", () => {
  it("rejects empty names", () => {
    expect(() => validateName("")).toThrow("required");
  });

  it("rejects whitespace-only names", () => {
    expect(() => validateName("   ")).toThrow("required");
  });

  it("accepts valid names", () => {
    expect(() => validateName("John Doe")).not.toThrow();
  });
});
