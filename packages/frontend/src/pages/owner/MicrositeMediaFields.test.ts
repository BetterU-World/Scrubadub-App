// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { GalleryEntry, MediaImage } from "../../../../../convex/lib/micrositeMediaModel";
import { GalleryFields } from "./MicrositeMediaFields";
import type { MicrositeImageEditor } from "./useMicrositeImages";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

it("creates independent photos from one selection and preserves the opposite slot when replacing a swapped image", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const choose = vi.fn<MicrositeImageEditor["choose"]>();
  const images: MicrositeImageEditor = {
    choose, remaining: 8, job: () => undefined, source: () => undefined,
    hasJobForEntry: () => false, retry: vi.fn(), removeJob: vi.fn(), blocked: false, markSaved: vi.fn(),
  };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let entries: GalleryEntry[] = [];
  function Editor() {
    const [items, setItems] = useState<GalleryEntry[]>([]);
    entries = items;
    return createElement(GalleryFields, { entries: items, images, onChange: setItems });
  }
  const input = (field: ParentNode, number: number) => field.querySelectorAll<HTMLInputElement>('input[type="file"]')[number];
  const select = async (field: HTMLInputElement, ...files: string[]) => {
    Object.defineProperty(field, "files", { configurable: true, value: files.map((name) => new File(["jpg"], name)) });
    await act(() => field.dispatchEvent(new Event("change", { bubbles: true })));
  };
  const button = (label: string) => [...host.querySelectorAll("button")].find((candidate) => candidate.textContent === label)!;
  const asset = (name: string): MediaImage => ({ assetId: name as MediaImage["assetId"], alt: name });
  const finish = (job: number, name: string) => act(() => choose.mock.calls[job][3](asset(name)));
  try {
    await act(() => root.render(createElement(Editor)));
    await select(input(host, 0), "first.jpg", "second.jpg");
    expect(choose.mock.calls.map(([key, file]) => [key, file.name])).toEqual([
      [`${entries[0].id}:image`, "first.jpg"], [`${entries[1].id}:image`, "second.jpg"],
    ]);
    expect(entries[0].id).not.toBe(entries[1].id);
    const originalIds = entries.map(({ id }) => id);
    await finish(1, "second");
    await finish(0, "first");
    expect(entries).toMatchObject([{ id: originalIds[0], image: asset("first") }, { id: originalIds[1], image: asset("second") }]);
    await act(() => button("miniSiteMedia.addPair").click());
    const pair = () => host.querySelectorAll("fieldset")[2];
    await select(input(pair(), 0), "before.jpg");
    await finish(2, "before");
    expect(pair().textContent).toContain("miniSiteMedia.incomplete");
    await select(input(pair(), 1), "after.jpg");
    await finish(3, "after");
    const pairId = entries[2].id;
    await act(() => button("miniSiteMedia.swap").click());
    expect(entries[2]).toMatchObject({ id: pairId, before: asset("after"), after: asset("before") });
    await select(input(pair(), 0), "replacement.jpg");
    await finish(4, "replacement");
    expect(entries[2]).toMatchObject({ id: pairId, before: asset("replacement"), after: asset("before") });
  } finally {
    await act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
