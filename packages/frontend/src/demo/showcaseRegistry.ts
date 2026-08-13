import type { LucideIcon } from "lucide-react";
import {
  ownerSections,
  workerSections,
  type NavItem,
  type NavSection,
} from "../components/layout/navigation";
import { CircleUserRound, CreditCard, FileText, Home, MapPin, Sparkles, Wrench } from "lucide-react";

export type ShowcasePersona = "owner" | "worker" | "client";
export type ShowcasePageAvailability = "implemented" | "preview" | "placeholder" | "hidden";
export type ShowcaseShell = "sidebar" | "client-sections";

export interface ShowcasePageDefinition {
  id: string;
  persona: ShowcasePersona;
  relativePath: string;
  sourceHref: string;
  labelKey: string;
  icon: LucideIcon;
  availability: ShowcasePageAvailability;
  shell: ShowcaseShell;
  mobile: {
    visible: boolean;
    priority?: number;
  };
  description?: string;
  capabilities?: readonly string[];
}

export interface ShowcaseNavigationSection {
  titleKey: string;
  pages: ShowcasePageDefinition[];
}

interface ShowcaseDisposition {
  relativePath: string;
  availability: ShowcasePageAvailability;
  description?: string;
  capabilities?: readonly string[];
}

const ownerDispositions: Record<string, ShowcaseDisposition> = {
  "/": implemented("/"),
  "/properties": implemented("/properties"),
  "/inventory-templates": placeholder("/inventory-templates", "standardize property inventory", ["Create reusable inventory templates", "Set expected supplies and quantities", "Apply consistent standards across properties"]),
  "/employees": implemented("/employees"),
  "/jobs": implemented("/jobs"),
  "/jobs/requests": { relativePath: "/jobs/requests", availability: "hidden" },
  "/calendar": implemented("/calendar"),
  "/red-flags": placeholder("/red-flags", "surface issues that need operational attention", ["Review property and job concerns", "Track resolution status", "Keep follow-up work visible"]),
  "/performance": placeholder("/performance", "understand team performance", ["Review completion and quality signals", "Compare operational trends", "Recognize coaching opportunities"]),
  "/analytics": implemented("/analytics"),
  "/financials": implemented("/financials"),
  "/partners": placeholder("/partners", "coordinate trusted business partners", ["Maintain partner relationships", "Share relevant job context", "Track collaborative work"]),
  "/requests": implemented("/requests"),
  "/clients": implemented("/clients"),
  "/commercial-accounts": implemented("/commercial-accounts"),
  "/commercial-invoices": implemented("/commercial-invoices"),
  "/feedback": placeholder("/feedback", "collect and review service feedback", ["Review client feedback", "Identify quality trends", "Connect feedback to operational follow-up"]),
  "/cleaner-leads": placeholder("/cleaner-leads", "organize prospective worker interest", ["Review worker leads", "Track recruiting progress", "Move qualified people toward onboarding"]),
  "/owner/payments": placeholder("/payments", "understand worker payment activity", ["Review planned cleaner payments", "Track settlement status", "Connect payments to completed work"]),
  "/affiliate": placeholder("/affiliate", "support referral partnerships", ["Review referral activity", "Understand affiliate earnings", "Track referred relationships"]),
  "/notifications": placeholder("/notifications", "keep important operational updates visible", ["Review recent updates", "See job and account activity", "Return to the relevant workspace"]),
  "/site": placeholder("/site", "present the cleaning company online", ["Manage company-facing information", "Organize public service details", "Support client discovery and requests"]),
  "/manuals": placeholder("/manuals", "share operating standards with the team", ["Organize company and property manuals", "Make instructions available to workers", "Track important operating guidance"]),
  "/audit-log": placeholder("/audit-log", "review important account activity", ["Understand when records changed", "Review operational history", "Support accountability across the company"]),
  "/owner/settings/add-ons": placeholder("/settings/add-ons", "maintain optional service offerings", ["Define add-on services", "Organize pricing and availability", "Reuse offerings across service workflows"]),
  "/owner/settings": implemented("/settings"),
};

const workerDispositions: Record<string, ShowcaseDisposition> = {
  "/": implemented("/"),
  "/jobs": implemented("/jobs"),
  "/calendar": implemented("/calendar"),
  "/availability": implemented("/availability"),
  "/payments": implemented("/payments"),
  "/notifications": placeholder("/notifications", "keep important work updates together", ["Review assignment updates", "See schedule and workflow notices", "Return to the relevant job context"]),
  "/manuals": placeholder("/manuals", "access the standards needed on the job", ["Read company operating guidance", "Review property-specific instructions", "Keep service expectations close at hand"]),
  "/settings": implemented("/settings"),
};

const clientPages: ShowcasePageDefinition[] = [
  ["home", "/", "/client/home", "clientPortal.navigation.home", Home],
  ["services", "/services", "/client/services", "clientPortal.navigation.services", Wrench],
  ["requests", "/requests", "/client/requests", "clientPortal.navigation.requests", Sparkles],
  ["documents", "/documents", "/client/documents", "clientPortal.navigation.documents", FileText],
  ["billing", "/billing", "/client/billing", "clientPortal.navigation.billing", CreditCard],
  ["locations", "/locations", "/client/locations", "clientPortal.navigation.locations", MapPin],
  ["account", "/account", "/client/account", "clientPortal.navigation.account", CircleUserRound],
].map(([id, relativePath, sourceHref, labelKey, icon], index) => ({ id: `client:${id}`, persona: "client", relativePath, sourceHref, labelKey, icon, availability: "implemented", shell: "client-sections", mobile: { visible: index < 4, priority: index } } as ShowcasePageDefinition));

export const workerShowcaseJourneyRoutes = {
  jobs: "/jobs",
  jobDetail: "/jobs/:showcaseJobId",
  checklist: "/jobs/:showcaseJobId/checklist",
} as const;

function implemented(relativePath: string): ShowcaseDisposition {
  return { relativePath, availability: "implemented" };
}

function placeholder(
  relativePath: string,
  purpose: string,
  capabilities: readonly string[]
): ShowcaseDisposition {
  return {
    relativePath,
    availability: "placeholder",
    description: `The full SCRUB product helps this team ${purpose}.`,
    capabilities,
  };
}

const sources: Record<Exclude<ShowcasePersona, "client">, NavSection[]> = {
  owner: ownerSections,
  worker: workerSections,
};

const dispositions: Record<Exclude<ShowcasePersona, "client">, Record<string, ShowcaseDisposition>> = {
  owner: ownerDispositions,
  worker: workerDispositions,
};

function adaptItem(persona: "owner" | "worker", item: NavItem): ShowcasePageDefinition {
  const disposition = dispositions[persona][item.href];
  if (!disposition) {
    throw new Error(`Missing SCRUB Showcase disposition for ${persona}:${item.href}`);
  }

  return {
    id: `${persona}:${item.href}`,
    persona,
    sourceHref: item.href,
    relativePath: disposition.relativePath,
    labelKey: item.labelKey,
    icon: item.icon,
    availability: disposition.availability,
    shell: "sidebar",
    mobile: { visible: item.mobile === true, priority: item.mobileOrder },
    description: disposition.description,
    capabilities: disposition.capabilities,
  };
}

export function getShowcaseNavigationSections(
  persona: ShowcasePersona
): ShowcaseNavigationSection[] {
  if (persona === "client") return [{ titleKey: "clientPortal.title", pages: clientPages }];
  return sources[persona].map((section) => ({
    titleKey: section.titleKey,
    pages: section.items.map((item) => adaptItem(persona, item)).filter((page) => page.availability !== "hidden"),
  }));
}

export function getShowcasePages(persona: ShowcasePersona): ShowcasePageDefinition[] {
  return getShowcaseNavigationSections(persona).flatMap((section) => section.pages);
}

export function getShowcasePage(
  persona: ShowcasePersona,
  relativePath: string
): ShowcasePageDefinition | undefined {
  return getShowcasePages(persona).find((page) => page.relativePath === relativePath);
}

export function buildShowcasePath(
  persona: ShowcasePersona,
  relativePath: string,
  presentation = false
): string {
  const normalizedPath = relativePath === "/" ? "" : `/${relativePath.replace(/^\/+|\/+$/g, "")}`;
  return `/internal/demo/${persona}${normalizedPath}${presentation ? "?presentation=1" : ""}`;
}

export function getShowcaseRelativePath(pathname: string, persona: ShowcasePersona): string | null {
  const basePath = `/internal/demo/${persona}`;
  if (pathname === basePath || pathname === `${basePath}/`) return "/";
  if (!pathname.startsWith(`${basePath}/`)) return null;
  return pathname.slice(basePath.length).replace(/\/+$/, "") || "/";
}

export function assertShowcaseRegistryComplete(): void {
  for (const persona of ["owner", "worker"] as const) {
    const sourceItems = sources[persona].flatMap((section) => section.items);
    const personaDispositions = dispositions[persona];
    for (const item of sourceItems) {
      if (!personaDispositions[item.href]) {
        throw new Error(`Missing SCRUB Showcase disposition for ${persona}:${item.href}`);
      }
    }
    for (const sourceHref of Object.keys(personaDispositions)) {
      if (sourceItems.filter((item) => item.href === sourceHref).length !== 1) {
        throw new Error(`SCRUB Showcase disposition must map exactly once: ${persona}:${sourceHref}`);
      }
    }
  }
}

assertShowcaseRegistryComplete();
