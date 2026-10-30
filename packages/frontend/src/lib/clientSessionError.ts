import { SESSION_REQUIRED_ERROR } from "../../../../convex/lib/sessionConstants";

/** Only explicit session rejection is recoverable; relationship and service errors are not. */
export function isClientSessionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.replace(/\r\n/g, "\n").trim();
  return message === SESSION_REQUIRED_ERROR ||
    message.endsWith(`Uncaught Error: ${SESSION_REQUIRED_ERROR}`) ||
    message.includes(`Uncaught Error: ${SESSION_REQUIRED_ERROR}\n`);
}
