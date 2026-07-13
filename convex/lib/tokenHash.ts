declare const process: { env: Record<string, string | undefined> };

/** Hash a one-time token in Convex's V8 runtime without retaining the raw value. */
export async function hashTokenForLookup(token: string): Promise<string> {
  const pepper = process.env.TOKEN_PEPPER;
  if (!pepper) throw new Error("Token verification is unavailable");

  const input = new TextEncoder().encode(token + pepper);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0")
  ).join("");
}
