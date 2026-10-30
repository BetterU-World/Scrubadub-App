import { SESSION_REQUIRED_ERROR } from "../../../../convex/lib/sessionConstants";

/** Match the server's explicit session rejection, including Convex's transport wrapper. */
export function isStaffSessionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.replace(/\r\n/g, "\n").trim();
  return message === SESSION_REQUIRED_ERROR ||
    message.endsWith(`Uncaught Error: ${SESSION_REQUIRED_ERROR}`) ||
    message.includes(`Uncaught Error: ${SESSION_REQUIRED_ERROR}\n`);
}
