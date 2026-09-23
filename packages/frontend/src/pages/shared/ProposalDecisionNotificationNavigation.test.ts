import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

let staffUser: any;
vi.mock("convex/react", () => ({
  useQuery: () => [{ _id: "notification-1", _creationTime: 1, read: true, title: "Proposal accepted", message: "Review the request", relatedClientRequestId: "request-1" }],
  useMutation: () => vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: staffUser }),
  getStaffSessionToken: () => "session",
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/ui/PageHeader", () => ({ PageHeader: () => null }));
vi.mock("@/components/ui/LoadingSpinner", () => ({ PageLoader: () => null }));
vi.mock("@/components/ui/EmptyState", () => ({ EmptyState: () => null }));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: ReactNode }) => createElement("a", { href }, children) }));

import { NotificationsPage } from "./NotificationsPage";

describe("proposal decision notification navigation", () => {
  it.each([
    [{ role: "owner" }, true],
    [{ role: "manager", canManageSalesAndCommercial: true }, true],
    [{ role: "manager", canManageSalesAndCommercial: false }, false],
  ] as const)("shows the request link only when %j has request access", (user, visible) => {
    staffUser = { _id: "staff-1", ...user };
    const html = renderToStaticMarkup(createElement(NotificationsPage));
    expect(html.includes('href="/requests/request-1"')).toBe(visible);
  });
});
