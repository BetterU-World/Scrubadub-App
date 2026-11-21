import { describe, expect, it, vi } from "vitest";
import {
  eligibleForeground,
  FOREGROUND_THROTTLE_MS,
  startForegroundPresence,
} from "./foregroundPresence";

describe("foreground presence policy", () => {
  it("counts visible read-only staff screens and excludes public, client, affiliate and Showcase", () => {
    expect(eligibleForeground("/jobs", true, "owner")).toBe(true);
    expect(eligibleForeground("/", true, "manager")).toBe(true);
    expect(eligibleForeground("/jobs", false, "cleaner")).toBe(false);
    for (const path of [
      "/internal/demo/owner",
      "/demo",
      "/showcase",
      "/client/requests",
      "/login",
    ])
      expect(eligibleForeground(path, true, "owner")).toBe(false);
    for (const role of ["client", "affiliate", undefined])
      expect(eligibleForeground("/", true, role)).toBe(false);
  });
  it("deduplicates across tabs without storing paths or credentials; observes visible returns", async () => {
    const values = new Map<string, string>(),
      observe = vi.fn(async () => ({}));
    let time = 1_000_000,
      visible = true;
    const options = {
      path: "/jobs",
      role: "cleaner",
      accountKey: "user:company:cleaner",
      now: () => time,
      visible: () => visible,
      observe,
      storage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
          values.set(key, value);
        },
      },
    };
    const first = startForegroundPresence(options),
      second = startForegroundPresence(options);
    await first.record();
    await second.record();
    expect(observe).toHaveBeenCalledTimes(1);
    time += FOREGROUND_THROTTLE_MS;
    visible = false;
    await second.record();
    expect(observe).toHaveBeenCalledTimes(1);
    visible = true;
    await second.record();
    expect(observe).toHaveBeenCalledTimes(2);
    expect([...values.values()]).toEqual([String(time)]);
    first.dispose();
    time += FOREGROUND_THROTTLE_MS;
    await first.record();
    expect(observe).toHaveBeenCalledTimes(2);
  });
  it("serializes simultaneous tabs with the browser lock and leaves failed observations retryable", async () => {
    let value: string | null = null,
      tail = Promise.resolve();
    const observe = vi.fn(async () => ({}));
    const options = {
      path: "/",
      role: "owner",
      accountKey: "u:c:owner",
      now: () => 1_000_000,
      visible: () => true,
      observe,
      storage: {
        getItem: () => value,
        setItem: (_key: string, next: string) => {
          value = next;
        },
      },
      lock: (work: () => Promise<void>) => {
        tail = tail.then(work);
        return tail;
      },
    };
    await Promise.all([
      startForegroundPresence(options).record(),
      startForegroundPresence(options).record(),
    ]);
    expect(observe).toHaveBeenCalledTimes(1);
    value = null;
    observe.mockRejectedValueOnce(new Error("offline"));
    const recorder = startForegroundPresence({ ...options, lock: undefined });
    await expect(recorder.record()).rejects.toThrow("offline");
    expect(value).toBeNull();
    await recorder.record();
    expect(value).toBe("1000000");
  });
});
