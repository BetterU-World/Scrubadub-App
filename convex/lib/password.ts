"use node";

import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

/** Hash a password with bcrypt. Only call from "use node" actions. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/** Verify a password against a bcrypt hash. */
export async function verifyBcryptPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Check if a hash is a legacy simpleHash (prefix "sh_"). */
export function isLegacyHash(hash: string): boolean {
  return hash.startsWith("sh_");
}

/** Verify a password against the legacy simpleHash algorithm. */
export function verifyLegacyPassword(
  password: string,
  storedHash: string
): boolean {
  const computed = legacySimpleHash(password);
  // Constant-time comparison for legacy hashes
  if (computed.length !== storedHash.length) return false;
  let result = 0;
  for (let i = 0; i < computed.length; i++) {
    result |= computed.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return result === 0;
}

/** Reproduce the original simpleHash for migration verification. */
function legacySimpleHash(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `sh_${Math.abs(hash).toString(36)}_${password.length}`;
}
