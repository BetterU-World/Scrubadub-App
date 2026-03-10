/**
 * Single source of truth for founder / internal-tester emails.
 *
 * At runtime the Convex env-var FOUNDER_EMAILS (comma-separated) is merged
 * with the hardcoded fallback list so the bypass works even before the
 * env-var is configured.
 */

const HARDCODED: string[] = ["dzbfyse@gmail.com"];

let _cache: string[] | null = null;

export function getFounderEmails(): string[] {
  if (_cache) return _cache;
  const envRaw = process.env.FOUNDER_EMAILS ?? "";
  const fromEnv = envRaw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  _cache = Array.from(new Set([...HARDCODED, ...fromEnv]));
  return _cache;
}

export function isFounderEmail(email: string): boolean {
  return getFounderEmails().includes(email.toLowerCase());
}
