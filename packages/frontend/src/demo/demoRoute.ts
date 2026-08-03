export const OWNER_DEMO_PATH = "/internal/demo/owner";
export const WORKER_DEMO_PATH = "/internal/demo/worker";

export type DemoPersona = "owner" | "worker";

export function isDemoModeEnabled(value: unknown): boolean {
  return value === "true";
}

export function shouldRenderDemoApp(pathname: string, enabledValue: unknown): boolean {
  return getDemoPersona(pathname) !== null && isDemoModeEnabled(enabledValue);
}

export function getDemoPersona(pathname: string): DemoPersona | null {
  if (matchesPersonaPath(pathname, OWNER_DEMO_PATH)) return "owner";
  if (matchesPersonaPath(pathname, WORKER_DEMO_PATH)) return "worker";
  return null;
}

function matchesPersonaPath(pathname: string, personaPath: string): boolean {
  return pathname === personaPath || pathname.startsWith(`${personaPath}/`);
}

export function isDemoPresentationMode(search: string): boolean {
  return new URLSearchParams(search).get("presentation") === "1";
}
