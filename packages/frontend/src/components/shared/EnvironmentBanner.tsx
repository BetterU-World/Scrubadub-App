type EnvironmentBannerProps = {
  dev?: boolean;
  convexUrl?: string;
};

export function getEnvironmentLabel(convexUrl?: string): string {
  if (!convexUrl) return "DEV · backend not configured";
  try {
    return `DEV · ${new URL(convexUrl).hostname}`;
  } catch {
    return "DEV · invalid backend URL";
  }
}

export function EnvironmentBanner({
  dev = import.meta.env.DEV,
  convexUrl = import.meta.env.VITE_CONVEX_URL,
}: EnvironmentBannerProps) {
  if (!dev) return null;
  return (
    <div
      role="status"
      aria-label="Development environment"
      className="fixed bottom-2 right-2 z-[100000] rounded-md bg-amber-300 px-3 py-1 text-xs font-bold text-amber-950 shadow-md"
    >
      {getEnvironmentLabel(convexUrl)}
    </div>
  );
}
