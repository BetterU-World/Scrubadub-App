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
  if (pathname === OWNER_DEMO_PATH) return "owner";
  if (pathname === WORKER_DEMO_PATH) return "worker";
  return null;
}

export function isDemoPresentationMode(search: string): boolean {
  return new URLSearchParams(search).get("presentation") === "1";
}
