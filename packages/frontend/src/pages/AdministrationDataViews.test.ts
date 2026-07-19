import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

let queryResults: unknown[] = [];
let queryIndex = 0;

vi.mock("convex/react", () => ({
  useQuery: () => queryResults[queryIndex++],
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  getStaffSessionToken: () => "session-token",
  useAuth: () => ({
    user: {
      _id: "owner-1",
      companyId: "company-1",
      isSuperadmin: true,
    },
    sessionToken: "session-token",
    isLoading: false,
  }),
}));

vi.mock("@/components/ui/FeedbackProvider", () => ({
  useSimpleFeedbackState: () => [null, vi.fn()],
}));

vi.mock("@/components/ui/PageHeader", () => ({
  PageHeader: ({ title, description, action }: { title: string; description?: string; action?: ReactNode }) =>
    createElement("header", null, createElement("h1", null, title), description, action),
}));

vi.mock("@/components/ui/LoadingSpinner", () => ({
  PageLoader: () => createElement("div", null, "Loading"),
  LoadingSpinner: () => createElement("span", null, "Loading"),
}));

vi.mock("@/components/ui/EmptyState", () => ({
  EmptyState: ({ title, description, action }: { title: string; description: string; action?: ReactNode }) =>
    createElement("div", null, title, description, action),
}));

vi.mock("@/components/ui/StatusBadge", () => ({
  StatusBadge: ({ status }: { status: string }) => createElement("span", null, status),
}));

vi.mock("@/components/ui/AsyncButton", () => ({
  AsyncButton: ({ children, ...props }: { children: ReactNode }) =>
    createElement("button", props, children),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values?.name ? `${key}:${values.name}` : key,
  }),
}));

vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));

vi.mock("@/components/ui/ConfirmDialog", () => ({
  ConfirmDialog: ({
    open,
    title,
    confirmLabel,
    confirmVariant,
  }: {
    open: boolean;
    title: string;
    confirmLabel: string;
    confirmVariant: string;
  }) =>
    createElement("div", {
      "data-confirm-open": String(open),
      "data-confirm-title": title,
      "data-confirm-label": confirmLabel,
      "data-confirm-variant": confirmVariant,
    }),
}));

vi.mock("@radix-ui/react-dialog", () => {
  const Primitive = ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children);
  return {
    Root: Primitive,
    Portal: Primitive,
    Overlay: Primitive,
    Content: Primitive,
    Title: Primitive,
    Close: Primitive,
  };
});

import { AffiliateInvitesPage } from "./admin/AffiliateInvitesPage";
import { EmployeeListPage } from "./owner/EmployeeListPage";

describe("Administration responsive data views", () => {
  beforeEach(() => {
    queryResults = [];
    queryIndex = 0;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: { origin: "https://example.test", pathname: "/employees", search: "" },
        history: { replaceState: vi.fn() },
      },
    });
  });

  it("renders employees through one responsive table with reachable actions", () => {
    const longName = "María Alejandra Rodríguez de la Administración Comercial";
    const longEmail = "maria.alejandra.rodriguez.operations@example-cleaning-company.com";
    queryResults = [
      [
        { _id: "owner-1", name: "Owner", email: "owner@example.com", role: "owner", status: "active" },
        { _id: "manager-1", name: longName, email: longEmail, role: "manager", status: "active" },
        { _id: "pending-1", name: "Pending Worker", email: "pending@example.com", role: "cleaner", status: "pending", invitationStatus: "pending" },
      ],
      [
        { userId: "manager-1", primaryRole: "manager", workerType: "w2_employee", onboardingStatus: "in_progress", jobEligibilityStatus: "eligible", workerStatus: "active" },
      ],
      [],
      undefined,
      undefined,
    ];

    const markup = renderToStaticMarkup(createElement(EmployeeListPage));

    expect(markup.match(/<table/g)).toHaveLength(1);
    expect(markup).toContain("block w-full sm:table");
    expect(markup).toContain("hidden sm:table-header-group");
    expect(markup).toContain("sm:table-row");
    expect(markup).toContain("break-all");
    expect(markup).toContain(longName);
    expect(markup).toContain(longEmail);
    expect(markup).toContain("employees.role");
    expect(markup).toContain("employees.status");
    expect(markup).toContain("min-h-11");
    expect(markup).toContain("employees.permissions");
    expect(markup).toContain("employees.resendInvitation");
    expect(markup).toContain("employees.revokeInvitation");
    expect(markup).toContain('data-confirm-variant="danger"');
  });

  it("renders affiliate invitations as one responsive table with labeled actions", () => {
    const longEmail = "affiliate.operations.team@example-extra-long-commercial-domain.com";
    queryResults = [[{
      _id: "affiliate-1",
      email: longEmail,
      name: "Affiliate Operations Team",
      status: "pending",
      inviteTokenExpiry: Date.now() + 60_000,
      referralCode: "AFFILIATE2026",
      affiliateStripeAccountId: null,
      _creationTime: Date.now(),
    }]];

    const markup = renderToStaticMarkup(createElement(AffiliateInvitesPage));

    expect(markup.match(/<table/g)).toHaveLength(1);
    expect(markup).toContain("block w-full text-sm sm:table");
    expect(markup).toContain("hidden sm:table-header-group");
    expect(markup).toContain("break-all");
    expect(markup).toContain(longEmail);
    expect(markup).toContain("Pending");
    expect(markup).toContain("Created:");
    expect(markup).toContain("touch-target");
    expect(markup).toContain(`aria-label="Resend invite to ${longEmail}"`);
    expect(markup).toContain(`aria-label="Revoke affiliate invitation for ${longEmail}"`);
    expect(markup).toContain('data-confirm-variant="danger"');
  });
});
