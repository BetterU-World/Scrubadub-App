// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { getFunctionName } from "convex/server";
import en from "../i18n/en/common.json";
import es from "../i18n/es/common.json";

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), loadMore: vi.fn(), query: vi.fn() }));
let user: any;
let rows: any[];
let status = "CanLoadMore";
let language: "en" | "es" = "en";
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user }), getStaffSessionToken: () => "verified" }));
vi.mock("convex/react", () => ({
  useMutation: () => mocks.resolve,
  usePaginatedQuery: (ref: any, args: any) => { mocks.query(getFunctionName(ref), args); return { results: rows, status, loadMore: mocks.loadMore }; },
  useQuery: () => undefined,
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language }, t: (key: string, args?: Record<string, string>) => {
  let value: string = key.startsWith("workerReview.") ? (language === "es" ? es : en).workerReview[key.slice(13) as keyof typeof en.workerReview] ?? key : key;
  for (const [name, text] of Object.entries(args ?? {})) value = value.split(`{{${name}}}`).join(text);
  return value;
} }) }));

import { WorkerDeclineReviews, WorkerDeclineStatus } from "./WorkerDeclineReviews";
let host: HTMLDivElement, root: Root;
const render = async () => act(async () => root.render(createElement(WorkerDeclineReviews, { jobId: "job" as any })));
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  user = { _id: "owner", role: "owner" }; language = "en"; status = "CanLoadMore";
  rows = [{ _id: "review", workerName: '<img src=x onerror="bad()">', status: "pending", kind: "decline", reason: "Can't attend\nPlease review", requestedAt: 1 }];
  mocks.resolve.mockReset().mockResolvedValue({ replayed: false }); mocks.loadMore.mockReset(); mocks.query.mockReset();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

describe("worker availability review surface", () => {
  it.each(["en", "es"] as const)("renders %s review/history and resolves without assignment mutations", async lang => {
    language = lang;
    const copy = (lang === "es" ? es : en).workerReview;
    await render();
    expect(host.textContent).toContain(copy.title);
    expect(host.textContent).toContain(copy.staffHelp);
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain(rows[0].workerName);
    expect(mocks.query).toHaveBeenCalledWith("workerDeclineReviews:forJob", { jobId: "job", userId: "owner", sessionToken: "verified" });
    const resolve = Array.from(host.querySelectorAll("button")).find(b => b.textContent?.includes(copy.resolve))!;
    await act(async () => resolve.click());
    expect(mocks.resolve).toHaveBeenCalledWith({ reviewId: "review", userId: "owner", sessionToken: "verified" });
    expect(host.textContent).toContain(copy.resolvedHelp);
    const more = Array.from(host.querySelectorAll("button")).find(b => b.textContent?.includes(copy.loadMore))!;
    await act(async () => more.click());
    expect(mocks.loadMore).toHaveBeenCalledWith(10);
  });

  it("gates unauthorized roles with a skipped query and no review controls", async () => {
    for (const actor of [{ role: "cleaner" }, { role: "manager", canSeeAllJobs: true }, null]) {
      user = actor; await render();
      expect(host.textContent).toBe("");
      expect(mocks.query).toHaveBeenLastCalledWith("workerDeclineReviews:forJob", "skip");
    }
  });

  it("supports an operational manager and preserves resolved history", async () => {
    user = { _id: "manager", role: "manager", canManageSchedule: true };
    rows[0] = { ...rows[0], status: "resolved", resolvedByName: "Owner", resolvedAt: 2 };
    await render();
    expect(host.textContent).toContain(en.workerReview.resolved);
    expect(host.textContent).toContain("Owner");
    expect(host.textContent).toContain(rows[0].reason);
    expect(host.textContent).not.toContain(en.workerReview.resolve);
  });

  it("keeps review data and offers retry after a failed resolution", async () => {
    mocks.resolve.mockRejectedValueOnce(Error("Permission removed"));
    await render();
    const button = Array.from(host.querySelectorAll("button")).find(b => b.textContent?.includes(en.workerReview.resolve))!;
    await act(async () => button.click());
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(en.workerReview.failedResolve);
    expect(button.disabled).toBe(false);
    expect(host.textContent).toContain(rows[0].reason);
  });

  it("disables resolution while saving", async () => {
    let finish!: () => void;
    mocks.resolve.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    await render();
    const button = Array.from(host.querySelectorAll("button")).find(b => b.textContent?.includes(en.workerReview.resolve))!;
    await act(async () => button.click());
    expect(button.disabled).toBe(true);
    await act(async () => button.click());
    expect(mocks.resolve).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });

  it.each(["pending", "resolved"] as const)("explains %s worker access without claiming cancellation", async state => {
    await act(async () => root.render(createElement(WorkerDeclineStatus, { state: { reviewOnly: true, latest: { status: state, reason: "Unavailable" } } as any })));
    expect(host.textContent).toContain(en.workerReview[state === "pending" ? "pendingWorkerHelp" : "resolvedWorkerHelp"]);
  });
});
