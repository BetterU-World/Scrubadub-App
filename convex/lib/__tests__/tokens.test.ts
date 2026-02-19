import { describe, it, expect } from "vitest";
import {
  generateSecureToken,
  hashToken,
  INVITE_TOKEN_EXPIRY_MS,
  RESET_TOKEN_EXPIRY_MS,
} from "../tokens";

describe("generateSecureToken", () => {
  it("generates hex string of expected length", () => {
    const token = generateSecureToken();
    expect(token).toMatch(/^[0-9a-f]+$/);
    expect(token.length).toBe(64); // 32 bytes = 64 hex chars
  });

  it("generates unique tokens", () => {
    const a = generateSecureToken();
    const b = generateSecureToken();
    expect(a).not.toBe(b);
  });

  it("respects custom byte length", () => {
    const token = generateSecureToken(16);
    expect(token.length).toBe(32); // 16 bytes = 32 hex chars
  });
});

describe("hashToken", () => {
  it("produces deterministic hash for same input", () => {
    const hash1 = hashToken("test-token");
    const hash2 = hashToken("test-token");
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different tokens", () => {
    const hash1 = hashToken("token-a");
    const hash2 = hashToken("token-b");
    expect(hash1).not.toBe(hash2);
  });

  it("is a hex SHA-256 hash (64 chars)", () => {
    const hash = hashToken("any-token");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("token expiry constants", () => {
  it("invite token expires in 72 hours", () => {
    expect(INVITE_TOKEN_EXPIRY_MS).toBe(72 * 60 * 60 * 1000);
  });

  it("reset token expires in 1 hour", () => {
    expect(RESET_TOKEN_EXPIRY_MS).toBe(1 * 60 * 60 * 1000);
  });

  it("invite expiry is longer than reset expiry", () => {
    expect(INVITE_TOKEN_EXPIRY_MS).toBeGreaterThan(RESET_TOKEN_EXPIRY_MS);
  });
});
