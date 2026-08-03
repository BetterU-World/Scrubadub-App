import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement("a", { href, ...props }, children),
  useLocation: () => ["/client/services", vi.fn()],
}));
vi.mock("../shared/LanguageSwitcher", () => ({ LanguageSwitcher: () => createElement("button", null, "Language") }));

import { ClientPortalShell } from "./ClientPortalShell";

describe("client portal route navigation", () => {
  it("provides wrapping desktop links and an accessible mobile menu with active state", () => {
    const html = renderToStaticMarkup(createElement(ClientPortalShell, { clientName: "Compañía Internacional de Servicios Extraordinariamente Larga", pageTitle: "Mis servicios", onSignOut: vi.fn(), children: createElement("p", null, "Content") }));
    expect(html).toContain("min-h-dvh overflow-x-hidden");
    expect(html).toContain("flex flex-wrap gap-1");
    expect(html).toContain("<details");
    expect(html).toContain("Mis servicios");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('href="/client/account"');
    expect(html).toContain('href="/client/requests"');
    expect(html).toContain("btn-secondary touch-target");
  });
});
