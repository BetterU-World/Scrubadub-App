import crypto from "crypto";

const TOKEN_PEPPER = process.env.TOKEN_PEPPER ?? "scrubadub-default-pepper-change-me";

/** Generate a cryptographically secure random token (hex). Only call from "use node" actions. */
export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

/** Hash a token with SHA-256 + pepper for storage. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token + TOKEN_PEPPER).digest("hex");
}

/** Invite token expiry: 72 hours */
export const INVITE_TOKEN_EXPIRY_MS = 72 * 60 * 60 * 1000;

/** Password reset token expiry: 1 hour */
export const RESET_TOKEN_EXPIRY_MS = 1 * 60 * 60 * 1000;
