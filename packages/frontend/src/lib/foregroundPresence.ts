/** This policy is used only at the authenticated staff application boundary. Never persist paths. */
export const FOREGROUND_THROTTLE_MS = 5 * 60_000;
export function eligibleForeground(
  path: string,
  visible: boolean,
  role: string | undefined,
) {
  return (
    visible &&
    ["owner", "manager", "cleaner", "maintenance"].includes(role ?? "") &&
    !/^\/(internal|demo|showcase|client|login|signup|giveaway|assessment)(\/|$)/i.test(
      path,
    )
  );
}

export function startForegroundPresence(options: {
  path: string;
  role: string;
  accountKey: string;
  visible: () => boolean;
  observe: () => Promise<unknown>;
  storage: Pick<Storage, "getItem" | "setItem">;
  now?: () => number;
  lock?: (work: () => Promise<void>) => Promise<void>;
}) {
  let disposed = false,
    inFlight = false;
  const now = options.now ?? Date.now;
  const key = `scrub-presence-v1:${options.accountKey}`;
  async function run() {
    if (
      disposed ||
      !eligibleForeground(options.path, options.visible(), options.role)
    )
      return;
    let last = 0;
    try {
      last = Number(options.storage.getItem(key)) || 0;
    } catch {
      /* Server deduplicates when storage is unavailable. */
    }
    if (last > 0 && now() >= last && now() - last < FOREGROUND_THROTTLE_MS)
      return;
    await options.observe();
    try {
      options.storage.setItem(key, String(now()));
    } catch {
      /* No credentials or paths stored. */
    }
  }
  return {
    async record() {
      if (inFlight) return;
      inFlight = true;
      try {
        if (options.lock) await options.lock(run);
        else await run();
      } finally {
        inFlight = false;
      }
    },
    dispose() {
      disposed = true;
    },
  };
}
