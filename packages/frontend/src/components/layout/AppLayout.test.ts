// @vitest-environment jsdom
import React, { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppLayout } from "./AppLayout";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { role: "owner" } }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../LiveJobBanner", () => ({ LiveJobBanner: () => null }));
vi.mock("../shared/ForegroundPresence", () => ({ ForegroundPresence: () => null }));
vi.mock("../shared/AddToHomeScreenTip", () => ({ AddToHomeScreenTip: () => null }));
vi.mock("./Header", () => ({ Header: () => null }));
vi.mock("./Footer", () => ({ Footer: () => null }));
vi.mock("./MobileNav", () => ({ MobileNav: () => null }));

describe("workspace scroll on route changes", () => {
  let host: HTMLDivElement;
  let root: Root;
  let desktop: boolean;

  beforeEach(async () => {
    desktop = true;
    vi.stubGlobal("React", React);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("matchMedia", () => ({ matches: desktop }));
    window.history.replaceState(null, "", "/");
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root.render(createElement(AppLayout, { children: "Workspace" })));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("keeps the containing block for absolute page content on the desktop scroll pane", () => {
    const workspace = host.querySelector("main")!.parentElement!;

    // A viewport-relative sr-only caption below the fold can extend the document.
    expect(workspace.classList).toContain("md:relative");
    expect(workspace.classList).toContain("md:overflow-y-auto");
    expect(workspace.classList).not.toContain("relative");
  });

  it("resets the desktop workspace and retains the mounted sidebar's position", async () => {
    const workspace = host.querySelector("main")!.parentElement!;
    const nav = host.querySelector("aside nav")!;
    const links = [...nav.querySelectorAll("a")];
    const destination = links.find((link) => link.pathname !== "/")!;
    workspace.scrollTop = 300;
    nav.scrollTop = 120;

    await act(async () => destination.click());

    expect(window.location.pathname).toBe(destination.pathname);
    expect(workspace.scrollTop).toBe(0);
    expect(host.querySelector("aside nav")).toBe(nav);
    expect(nav.scrollTop).toBe(120);

    workspace.scrollTop = 250;
    await act(async () => destination.click());
    await act(async () => window.history.pushState(null, "", "?filter=open"));
    await act(async () => window.history.pushState(null, "", "#details"));
    expect(workspace.scrollTop).toBe(250);
  });

  it("leaves mobile scrolling to the document", async () => {
    desktop = false;
    const documentScroll = vi.spyOn(window, "scrollTo");
    const workspace = host.querySelector("main")!.parentElement!;
    workspace.scrollTop = 180;

    await act(async () => window.history.pushState(null, "", "/jobs"));

    expect(workspace.scrollTop).toBe(180);
    expect(documentScroll).not.toHaveBeenCalled();
    documentScroll.mockRestore();
  });
});
