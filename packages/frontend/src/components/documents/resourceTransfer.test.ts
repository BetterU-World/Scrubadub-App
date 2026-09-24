import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchResourceBlob } from "./resourceTransfer";

afterEach(() => vi.unstubAllGlobals());

describe("authorized Resource retrieval", () => {
  it("assembles ranges with one generation and reports completion", async () => {
    const data = new TextEncoder().encode("PDF!");
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (_url: URL, init: RequestInit) => {
      const range = new Headers(init.headers).get("Range")!;
      requests.push(range);
      const match = /^bytes=(\d+)-(\d+)$/.exec(range)!;
      const start = Number(match[1]); const end = Number(match[2]);
      return new Response(data.slice(start, end + 1), { status: 206, headers: {
        "Content-Range": `bytes ${start}-${end}/${data.length}`,
        "Content-Type": "application/pdf", "X-Resource-Generation": "generation-one",
      } });
    });
    const progress: number[] = [];
    const blob = await fetchResourceBlob({ site: "https://example.convex.site", route: "client", resourceId: "resource-id", sessionToken: "token", onProgress: value => progress.push(value) });
    expect(await blob.text()).toBe("PDF!");
    expect(blob.type).toBe("application/pdf");
    expect(requests).toEqual(["bytes=0-0", "bytes=1-3"]);
    expect(progress.at(-1)).toBe(1);
  });

  it("discards a transfer when the Resource generation changes", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      const first = calls++ === 0;
      return new Response(first ? new Uint8Array([1]) : new Uint8Array([2, 3]), { status: 206, headers: {
        "Content-Range": first ? "bytes 0-0/3" : "bytes 1-2/3",
        "Content-Type": "application/pdf", "X-Resource-Generation": first ? "old" : "new",
      } });
    });
    await expect(fetchResourceBlob({ site: "https://example.convex.site", route: "staff", resourceId: "resource-id", sessionToken: "token" })).rejects.toThrow("changed");
  });
});
