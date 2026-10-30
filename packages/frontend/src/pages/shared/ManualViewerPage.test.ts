import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import owner from "@/manuals/owner.md?raw";
import ownerEs from "@/manuals/owner.es.md?raw";
import manager from "@/manuals/manager.md?raw";
import managerEs from "@/manuals/manager.es.md?raw";

const route = vi.hoisted(() => ({ slug: "owner", language: "en" }));
vi.mock("wouter", () => ({ useParams: () => ({ slug: route.slug }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({
  i18n: { language: route.language },
  t: (key: string, args?: { date: string }) => args ? `${key}: ${args.date}` : key,
}) }));
vi.mock("@/components/ui/PageBack", () => ({ PageBack: ({ href, label }: { href: string; label: string }) =>
  createElement("a", { href }, label),
}));

import { ManualViewerPage } from "./ManualViewerPage";

describe("published in-app guide rendering", () => {
  it.each([
    ["en", "Manager App Guide"], ["es", "Guía de la aplicación para gerentes"],
  ])("renders the %s Manager Guide with 17 sections and no optional capability dependency", (language, title) => {
    route.slug = "manager"; route.language = language;
    const html = renderToStaticMarkup(createElement(ManualViewerPage));
    expect(html).toContain(`<h1>${title}</h1>`);
    expect(html.match(/<h2>/g)).toHaveLength(17);
    expect(html).toContain("October 30, 2026");
    expect(html).toContain('href="/manuals/cleaner"');
    expect(html).not.toContain("�");
  });

  it("aligns Manager section order, numbered steps, permission blocks, lists, and links across languages", () => {
    const structure = (text: string) => text.split(/\r?\n/).map(line => {
      if (/^#{1,3} /.test(line)) return line.match(/^#+/)![0];
      if (/^\d+\. /.test(line)) return line.match(/^\d+\./)![0];
      if (line.startsWith("- ")) return "-";
      if (line.startsWith("**")) return "permission";
      return null;
    }).filter(Boolean);
    expect(structure(managerEs)).toEqual(structure(manager));
    for (const text of [manager, managerEs]) {
      expect([...text.matchAll(/^## (\d+)\./gm)].map(match => Number(match[1])))
        .toEqual(Array.from({ length: 17 }, (_, index) => index + 1));
    }
    const links = (text: string) => [...text.matchAll(/\]\(([^)]+)\)/g)].map(match => match[1]);
    expect(links(managerEs)).toEqual(links(manager));
  });

  it.each([
    ["en", "Owner App Guide"], ["es", "Guía de la aplicación para propietarios"],
  ])("renders the complete %s Owner Guide in the existing reader", (language, title) => {
    route.slug = "owner"; route.language = language;
    const html = renderToStaticMarkup(createElement(ManualViewerPage));
    expect(html).toContain(`<h1>${title}</h1>`);
    expect(html.match(/<h2>/g)).toHaveLength(21);
    expect(html).toContain("October 30, 2026");
    expect(html).not.toContain("March 1, 2026");
    expect(html).toContain('href="/manuals/cleaner"');
    expect(html).toContain('href="/jobs/quick"');
    expect(html).not.toContain("�");
  });

  it.each(["en", "es"])("keeps the Cleaner Guide release date consistent in %s", language => {
    route.slug = "cleaner"; route.language = language;
    const html = renderToStaticMarkup(createElement(ManualViewerPage));
    expect(html).toContain("October 30, 2026");
    expect(html).not.toContain("March 1, 2026");
  });

  it("preserves equivalent bilingual section, step, and link structure", () => {
    const structure = (text: string) => text.split(/\r?\n/).map(line => {
      if (/^#{1,3} /.test(line)) return line.match(/^#+/)![0];
      if (/^\d+\. /.test(line)) return line.match(/^\d+\./)![0];
      if (line.startsWith("- ")) return "-";
      return null;
    }).filter(Boolean);
    expect(structure(ownerEs)).toEqual(structure(owner));
    for (const text of [owner, ownerEs]) {
      expect([...text.matchAll(/^## (\d+)\./gm)].map(match => Number(match[1])))
        .toEqual(Array.from({ length: 21 }, (_, index) => index + 1));
    }
    const links = (text: string) => [...text.matchAll(/\]\(([^)]+)\)/g)].map(match => match[1]);
    expect(links(ownerEs)).toEqual(links(owner));
  });

  it("shows the same release date in the guide listing", () => {
    const listing = readFileSync(new URL("./ManualsPage.tsx", import.meta.url), "utf8");
    expect(listing).toContain('date: "October 30, 2026"');
    expect(listing).not.toContain("March 1, 2026");
  });
});
