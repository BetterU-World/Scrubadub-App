// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName, type FunctionArgs } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "wouter";
import { api } from "../../../../../convex/_generated/api";
import { publicMiniSitePresentation } from "../../../../../convex/lib/miniSitePresentation";
import { publicMiniSiteSections } from "../../../../../convex/lib/miniSiteSections";
import { MiniSiteContent } from "../public/PublicSitePage";
import { PublicRequestPage } from "../public/PublicRequestPage";
import { SiteSetupPage } from "./SiteSetupPage";

const { upsert, ensureToken } = vi.hoisted(() => ({ upsert: vi.fn(), ensureToken: vi.fn() }));
let savedSite: FunctionArgs<typeof api.mutations.companySites.upsertSite>;
let persistedSite: typeof savedSite & { publicRequestToken: string };
const requestToken = "service-association-test";
const requestCompany = { companyName: "Association Test" };

vi.mock("convex/react", () => ({
  useAction: () => vi.fn(),
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(ref);
    if (name === "queries/companySites:getMySite") return persistedSite;
    if (name === "queries/clientRequests:getCompanyByRequestToken") return requestCompany;
  },
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref) === "mutations/companySites:upsertSite" ? upsert : ensureToken,
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { _id: "owner", companyId: "company" }, sessionToken: "test-session" }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { number?: number }) => options?.number ? `${key} ${options.number}` : key,
    i18n: { resolvedLanguage: "en" },
  }),
}));
vi.mock("@/components/owner/ShareKit", () => ({ ShareKit: () => null }));

type Service = { name: string; description?: string; included?: string; excluded?: string };
const first: Service = { name: "Standard clean", description: "A weekly clean", included: "Counters", excluded: "Oven" };
const second: Service = { name: "Move-out & turnover", description: "An empty home clean", included: "Cabinets", excluded: "Carpet" };
const third: Service = { name: "Deep clean", description: "A top-to-bottom clean", included: "Baseboards", excluded: "Exterior" };
const replacement: Service = { name: "Office cleaning", description: "A workplace clean", included: "Desks", excluded: "Computers" };
const detailFields = ["description", "included", "excluded"] as const;

describe("My Site service detail associations", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    savedSite = {
      companyId: "company" as typeof savedSite.companyId, sessionToken: "test-session",
      slug: "association-test", templateId: "A", brandName: "Association Test", bio: "Cleaning services.",
      serviceArea: "Tampa", isPublished: true, services: [],
    };
    persistedSite = { ...savedSite, publicRequestToken: requestToken };
    upsert.mockReset().mockImplementation(async (value: typeof savedSite) => {
      savedSite = structuredClone(value);
      persistedSite = { ...savedSite, publicRequestToken: requestToken };
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  const rows = (host: HTMLElement) =>
    [...host.querySelectorAll<HTMLInputElement>('input[aria-label^="sitePresentation.serviceName"]')];

  function row(host: HTMLElement, name: string) {
    const input = rows(host).find((field) => field.value === name);
    if (!input) throw new Error(`Missing owner service row for ${name}`);
    return input.parentElement!.parentElement!;
  }

  async function fill(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    await act(async () => {
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  async function addService(service: Service) {
    const add = [...host.querySelectorAll("button")].find((button) => button.textContent?.trim() === "siteBuilder.addService")!;
    await act(async () => add.click());
    const inputs = rows(host);
    await fill(inputs[inputs.length - 1], service.name);
    const fields = row(host, service.name).querySelectorAll("textarea");
    expect([...fields].map((field) => field.value)).toEqual(["", "", ""]);
    for (const [index, key] of detailFields.entries()) {
      if (service[key]) await fill(fields[index], service[key]);
    }
  }

  async function removeService(name: string) {
    await act(async () => row(host, name).querySelector("button")!.click());
  }

  async function expectQuotePrefill(url: URL, name: string) {
    const quoteHost = document.createElement("div");
    const quoteRoot = createRoot(quoteHost);
    const previousUrl = window.location.href;
    window.history.replaceState(null, "", url);
    try {
      await act(async () => quoteRoot.render(createElement(Route, { path: "/r/:token", component: PublicRequestPage })));
      const group = [...quoteHost.querySelectorAll("fieldset")].find((section) => section.querySelector("legend")?.textContent === "Service type")!;
      const picker = group.querySelector("select")!;
      const builtIn = [...picker.options].find((item) => item.value.toLowerCase() === name.toLowerCase());
      expect(picker.value).toBe(builtIn?.value ?? "Other");
      if (!builtIn) {
        expect(group.querySelector("strong")?.textContent).toBe(name);
        expect([...quoteHost.querySelectorAll("textarea")].some((field) => field.value === `Interested in: ${name}`)).toBe(true);
      }
    } finally {
      await act(async () => quoteRoot.unmount());
      window.history.replaceState(null, "", previousUrl);
    }
  }

  async function saveAndReload(expected: Service[]) {
    await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(savedSite.services).toEqual(expected.map(({ name }) => name));
    expect(savedSite.presentation?.serviceDetails).toEqual(expected.flatMap((service, index) =>
      detailFields.some((field) => service[field]) ? [{ ...service, index }] : []));

    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => root.render(createElement(SiteSetupPage)));
    expect(rows(host).map((input) => input.value)).toEqual(expected.map(({ name }) => name));
    for (const service of expected) {
      expect([...row(host, service.name).querySelectorAll("textarea")].map((field) => field.value))
        .toEqual(detailFields.map((field) => service[field] ?? ""));
    }

    const services = savedSite.services ?? [];
    const markup = renderToStaticMarkup(createElement(MiniSiteContent, {
      site: {
        templateId: savedSite.templateId, brandName: savedSite.brandName, bio: savedSite.bio,
        serviceArea: savedSite.serviceArea, additionalServiceAreas: [], services,
        presentation: publicMiniSitePresentation(savedSite.presentation, services, savedSite.sections),
      },
      slug: savedSite.slug, publicRequestToken: requestToken, sections: publicMiniSiteSections(savedSite.sections),
      reviews: [], addOns: [],
    }));
    const publicPage = new DOMParser().parseFromString(markup, "text/html");
    const quoteLinks = [...publicPage.querySelectorAll<HTMLAnchorElement>('a[href*="?service="]')];
    expect(quoteLinks.map((link) => new URL(link.getAttribute("href")!, window.location.origin).searchParams.get("service")))
      .toEqual(expected.map(({ name }) => name));
    for (const [index, service] of expected.entries()) {
      const link = quoteLinks[index];
      const quoteUrl = new URL(link.getAttribute("href")!, window.location.origin);
      expect(quoteUrl.pathname).toBe(`/r/${requestToken}`);
      const card = link.parentElement!;
      expect(card.querySelector("h3")!.textContent).toBe(service.name);
      const detail = card.querySelector("details");
      if (detailFields.some((field) => service[field])) {
        expect([...detail!.querySelectorAll("p")].map((item) => item.textContent)).toEqual(detailFields.map((field) => service[field]));
      } else {
        expect(detail).toBeNull();
      }
      await expectQuotePrefill(quoteUrl, service.name);
    }
  }

  it("keeps details and quote links attached through first and middle deletion, renaming, and replacement", async () => {
    await act(async () => root.render(createElement(SiteSetupPage)));
    for (const service of [first, second, third]) await addService(service);
    await saveAndReload([first, second, third]);

    await removeService(first.name);
    await saveAndReload([second, third]);

    await addService(replacement);
    await saveAndReload([second, third, replacement]);
    await removeService(third.name);
    await saveAndReload([second, replacement]);

    const renamed = { ...second, name: "Move-in / move-out" };
    await fill(row(host, second.name).querySelector("input")!, renamed.name);
    await saveAndReload([renamed, replacement]);

    const reusedName = { name: third.name };
    await addService(reusedName);
    await saveAndReload([renamed, replacement, reusedName]);
  });
});
