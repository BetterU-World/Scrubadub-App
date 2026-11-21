// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ForegroundPresence } from "./ForegroundPresence";

const state = vi.hoisted(() => ({
  path: "/jobs",
  role: "owner",
  visibility: "visible",
}));
const observe = vi.fn(async () => ({ recorded: true }));
vi.mock("convex/react", () => ({ useMutation: () => observe }));
vi.mock("wouter", () => ({ useLocation: () => [state.path] }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "u", companyId: "c", role: state.role },
    sessionToken: "synthetic",
  }),
}));
afterEach(() => {
  state.path = "/jobs";
  state.role = "owner";
  state.visibility = "visible";
  observe.mockClear();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("records a visible read-only screen and ignores hidden navigation and background rerenders", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(document, "visibilityState", "get").mockImplementation(
    () => state.visibility as DocumentVisibilityState,
  );
  const root = createRoot(document.createElement("div"));
  try {
    await act(async () => root.render(createElement(ForegroundPresence)));
    expect(observe).toHaveBeenCalledTimes(1);
    await act(async () => root.render(createElement(ForegroundPresence))); // ordinary query-driven rerender
    expect(observe).toHaveBeenCalledTimes(1);
    state.visibility = "hidden";
    state.path = "/calendar";
    await act(async () => {
      root.render(createElement(ForegroundPresence));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(observe).toHaveBeenCalledTimes(1);
    localStorage.clear();
    state.visibility = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(observe).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
  }
});
it.each(["/internal/demo/owner", "/showcase", "/client/requests"])(
  "does not observe %s with an existing staff session",
  async (path) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    state.path = path;
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const root = createRoot(document.createElement("div"));
    try {
      await act(async () => root.render(createElement(ForegroundPresence)));
      expect(observe).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
    }
  },
);
