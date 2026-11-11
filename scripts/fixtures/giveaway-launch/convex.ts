export function useMutation() {
  return async (args: unknown) => {
    const target = window as unknown as { __giveawaySubmissions?: unknown[] };
    (target.__giveawaySubmissions ??= []).push(args);
    return { status: "received" };
  };
}
