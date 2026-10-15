import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAttachmentUpload } from "./useAttachmentUpload";
import type { Id } from "../../../../convex/_generated/dataModel";

const begin = vi.hoisted(() => vi.fn());
vi.mock("convex/react", () => ({ useMutation: () => begin }));
beforeEach(() => begin.mockReset().mockResolvedValue({ intentId: "synthetic-intent", uploadUrl: "https://upload.invalid", contentType: "image/jpeg; scrub-attachment=synthetic-nonce", expiresAt: 1 }));
afterEach(() => vi.unstubAllGlobals());
const target = { kind: "formPhoto" as const, formId: "synthetic-form" as Id<"forms"> };

describe("bound attachment upload transport", () => {
  it("uses the server-issued content binding and returns the matching file/intent pair", async () => {
    const post = vi.fn().mockResolvedValue(new Response(JSON.stringify({ storageId: "synthetic-storage" })));
    vi.stubGlobal("fetch", post);
    const file = new File(["synthetic"], "photo.jpg", { type: "image/jpeg" });
    const result = await useAttachmentUpload()(target, file, "synthetic-session");
    expect(begin).toHaveBeenCalledWith({ target, sessionToken: "synthetic-session", mimeType: "image/jpeg" });
    expect(post).toHaveBeenCalledWith("https://upload.invalid", { method: "POST", headers: { "Content-Type": "image/jpeg; scrub-attachment=synthetic-nonce" }, body: file });
    expect(result).toEqual({ storageId: "synthetic-storage", uploadIntentId: "synthetic-intent" });
  });

  it.each([400, 500])("does not expose a successful upload result after HTTP %s", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
    await expect(useAttachmentUpload()(target, new File(["synthetic"], "photo.jpg", { type: "image/jpeg" }), "synthetic-session")).rejects.toThrow("upload failed");
  });

  it("rejects empty uploads before issuing an intent and rejects incomplete server responses", async () => {
    const upload = useAttachmentUpload();
    await expect(upload(target, new File([], "empty.jpg", { type: "image/jpeg" }), "synthetic-session")).rejects.toThrow("10 MB");
    expect(begin).not.toHaveBeenCalled();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
    await expect(upload(target, new File(["synthetic"], "photo.jpg", { type: "image/jpeg" }), "synthetic-session")).rejects.toThrow("did not return a file");
  });
});
