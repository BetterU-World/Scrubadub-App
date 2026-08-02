export const OWNER_DEMO_PATH = "/internal/demo/owner";

export function isDemoModeEnabled(value: unknown): boolean {
  return value === "true";
}

export function shouldRenderDemoApp(pathname: string, enabledValue: unknown): boolean {
  return pathname === OWNER_DEMO_PATH && isDemoModeEnabled(enabledValue);
}

export function isDemoPresentationMode(search: string): boolean {
  return new URLSearchParams(search).get("presentation") === "1";
}
