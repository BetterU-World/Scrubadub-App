// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_MEDIA, type MediaConfig, type MediaImage } from "../../../../../convex/lib/micrositeMediaModel";
import type { PreparedImage } from "@/lib/prepareMicrositeImage";
import { useMicrositeImages } from "./useMicrositeImages";

const mocks = vi.hoisted(() => ({
  begin: vi.fn(), discard: vi.fn(), upload: vi.fn(), preview: vi.fn(), prepare: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref).endsWith(":begin") ? mocks.begin : mocks.discard,
  useAction: (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref).endsWith(":upload") ? mocks.upload : mocks.preview,
}));
vi.mock("@/lib/prepareMicrositeImage", async (original) => ({
  ...await original<typeof import("@/lib/prepareMicrositeImage")>(),
  prepareMicrositeImage: mocks.prepare,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const data = new Uint8Array([1, 2, 3]).buffer;
const prepared: PreparedImage = {
  blob: { size: data.byteLength, arrayBuffer: async () => data } as Blob, width: 10, height: 10, mime: "image/webp",
};

describe("microsite image queue", () => {
  let root: Root;
  let host: HTMLDivElement;
  let editor: ReturnType<typeof useMicrositeImages>;
  let mounted: boolean;

  function Editor() {
    const [config, setConfig] = useState<MediaConfig>(EMPTY_MEDIA);
    editor = useMicrositeImages("owner-token", config, false);
    return createElement("button", {
      onClick: () => editor.choose("photo:image", new File(["photo"], "photo.jpg"), "gallery", (image) =>
        setConfig({ team: [], gallery: [{ kind: "photo", id: "photo", title: "", caption: "", enabled: true, image }] })),
    });
  }
  const file = (name: string) => new File(["photo"], `${name}.jpg`);
  const unmount = async () => { await act(() => root.unmount()); mounted = false; };

  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("URL", Object.assign(class extends URL {}, { createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: vi.fn() }));
    mocks.prepare.mockReset().mockResolvedValue(prepared);
    mocks.begin.mockReset().mockImplementation(async ({ requestId }) => ({ assetId: requestId, ready: null }));
    mocks.upload.mockReset().mockImplementation(async ({ assetId }) => ({ assetId }));
    mocks.preview.mockReset().mockResolvedValue({ data, width: 10, height: 10, mime: "image/webp" });
    mocks.discard.mockReset().mockResolvedValue(null);
    host = document.createElement("div");
    root = createRoot(host);
    mounted = true;
    await act(() => root.render(createElement(Editor)));
  });

  afterEach(async () => {
    if (mounted) await unmount();
    vi.unstubAllGlobals();
  });

  it("skips removed and superseded queued jobs and ignores a superseded preparation", async () => {
    const first = deferred<PreparedImage>();
    mocks.prepare.mockReturnValueOnce(first.promise);
    const stale = vi.fn();
    const replacement = vi.fn();
    await act(() => {
      editor.choose("first:image", file("first"), "gallery", stale);
      editor.choose("queued:image", file("queued"), "gallery", stale);
      editor.removeJob("queued:image");
    });
    await act(() => { editor.choose("first:image", file("replacement"), "gallery", replacement); });
    await act(() => first.resolve(prepared));
    expect(mocks.prepare.mock.calls.map(([input]) => input.name)).toEqual(["first.jpg", "replacement.jpg"]);
    expect(mocks.begin).toHaveBeenCalledTimes(1);
    expect(stale).not.toHaveBeenCalled();
    expect(replacement).toHaveBeenCalledOnce();
  });

  it("discards an in-flight upload once and ignores its response after replacement", async () => {
    const uploading = deferred<{ assetId: string }>();
    mocks.upload.mockReturnValueOnce(uploading.promise);
    const stale = vi.fn();
    const replacement = vi.fn();
    await act(() => { editor.choose("photo:image", file("first"), "gallery", stale); });
    expect(mocks.upload).toHaveBeenCalledOnce();
    const oldAsset = mocks.upload.mock.calls[0][0].assetId;
    await act(() => { editor.choose("photo:image", file("second"), "gallery", replacement); });
    expect(mocks.discard).toHaveBeenCalledWith({ sessionToken: "owner-token", assetId: oldAsset });
    await act(() => uploading.resolve({ assetId: oldAsset }));
    expect(mocks.discard).toHaveBeenCalledTimes(1);
    expect(mocks.preview).toHaveBeenCalledTimes(1);
    expect(stale).not.toHaveBeenCalled();
    expect(replacement).toHaveBeenCalledOnce();
  });

  it("does not start server processing if the entry is removed while reading prepared bytes", async () => {
    const reading = deferred<ArrayBuffer>();
    mocks.prepare.mockResolvedValueOnce({ ...prepared, blob: { size: data.byteLength, arrayBuffer: () => reading.promise } });
    const complete = vi.fn();
    await act(() => { editor.choose("photo:image", file("first"), "gallery", complete); });
    const reserved = mocks.begin.mock.calls[0][0].requestId;
    await act(() => editor.removeJob("photo:image"));
    await act(() => reading.resolve(data));
    expect(mocks.discard).toHaveBeenCalledExactlyOnceWith({ sessionToken: "owner-token", assetId: reserved });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it("reuses a failed reservation for retries, discards it on exhaustion, and accepts a new selection", async () => {
    mocks.upload.mockRejectedValueOnce(new Error("temporary")).mockRejectedValueOnce(new Error("temporary"))
      .mockRejectedValueOnce(new Error("temporary"));
    const complete = vi.fn();
    await act(() => { editor.choose("photo:image", file("first"), "gallery", complete); });
    await act(() => editor.retry("photo:image"));
    await act(() => editor.retry("photo:image"));
    await act(() => editor.retry("photo:image"));
    expect(mocks.begin).toHaveBeenCalledTimes(3);
    const oldAsset = mocks.begin.mock.calls[0][0].requestId;
    expect(new Set(mocks.begin.mock.calls.map(([args]) => args.requestId))).toEqual(new Set([oldAsset]));
    expect(mocks.discard).toHaveBeenCalledExactlyOnceWith({ sessionToken: "owner-token", assetId: oldAsset });
    expect(editor.job("photo:image")).toMatchObject({ status: "failed", canRetry: false });
    await act(() => editor.removeJob("photo:image"));
    expect(editor.remaining).toBe(8);
    await act(() => { editor.choose("photo:image", file("new"), "gallery", complete); });
    expect(mocks.begin.mock.calls[3][0].requestId).not.toBe(oldAsset);
    expect(complete).toHaveBeenCalledOnce();
  });

  it("releases staged work and late reservations on navigation and starts with an empty queue when reopened", async () => {
    await act(() => { host.querySelector("button")!.click(); });
    const stagedAsset = mocks.upload.mock.calls[0][0].assetId;
    const pending = deferred<{ assetId: string; ready: null }>();
    mocks.begin.mockReturnValueOnce(pending.promise);
    const complete = vi.fn<(image: MediaImage) => void>();
    await act(() => { editor.choose("pending:image", file("pending"), "gallery", complete); });
    expect(mocks.begin).toHaveBeenCalledTimes(2);
    await unmount();
    root = createRoot(host);
    mounted = true;
    await act(() => root.render(createElement(Editor)));
    await act(() => pending.resolve({ assetId: "late", ready: null }));
    expect(mocks.discard.mock.calls.map(([args]) => args.assetId)).toEqual([stagedAsset, "late"]);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(complete).not.toHaveBeenCalled();
    expect(editor.remaining).toBe(8);
  });

  it("discards a cancelled failed upload and leaves committed work alone on navigation", async () => {
    mocks.upload.mockRejectedValueOnce(new Error("temporary"));
    await act(() => { editor.choose("failed:image", file("failed"), "gallery", vi.fn()); });
    const failedAsset = mocks.begin.mock.calls[0][0].requestId;
    await act(() => editor.removeJob("failed:image"));
    expect(mocks.discard).toHaveBeenCalledExactlyOnceWith({ sessionToken: "owner-token", assetId: failedAsset });
    await act(() => { host.querySelector("button")!.click(); });
    await act(() => editor.markSaved());
    await unmount();
    expect(mocks.discard).toHaveBeenCalledTimes(1);
  });
});
