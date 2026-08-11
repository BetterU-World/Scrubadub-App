import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

let role: "owner" | "manager" = "owner";

vi.mock("convex/react", () => ({
  useQuery: () => [],
  useMutation: () => vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "user-1", companyId: "company-1", role, canManageClients: role === "manager" },
    sessionToken: "session-token",
  }),
}));

vi.mock("@/components/owner/RelationshipDiagnostics", () => ({
  RelationshipDiagnostics: () => createElement("div", { "data-testid": "relationship-diagnostics" }, "Owner diagnostics"),
}));

vi.mock("@/components/ui/FeedbackProvider", () => ({ useFeedbackState: () => [null, vi.fn()] }));
vi.mock("@/components/ui/PageHeader", () => ({
  PageHeader: ({ title, action }: { title: string; action?: ReactNode }) => createElement("header", null, title, action),
}));
vi.mock("@/components/ui/LoadingSpinner", () => ({ PageLoader: () => createElement("div", null, "Loading") }));
vi.mock("@/components/ui/EmptyState", () => ({
  EmptyState: ({ title }: { title: string }) => createElement("div", null, title),
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("wouter", () => ({ Link: ({ children }: { children: ReactNode }) => createElement("a", null, children) }));

import { ClientRelationshipListPage } from "./ClientRelationshipListPage";

describe("Client relationship diagnostics access", () => {
  beforeEach(() => { role = "owner"; });

  it("keeps Owner relationship diagnostics on the Clients page", () => {
    expect(renderToStaticMarkup(createElement(ClientRelationshipListPage))).toContain("Owner diagnostics");
  });

  it("loads the Manager Clients page without mounting Owner diagnostics", () => {
    role = "manager";
    const markup = renderToStaticMarkup(createElement(ClientRelationshipListPage));
    expect(markup).toContain("No clients yet");
    expect(markup).not.toContain("Owner diagnostics");
  });
});
