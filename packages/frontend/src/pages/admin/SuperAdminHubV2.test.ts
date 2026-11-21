// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { SuperAdminPage, TopCompanies } from "./SuperAdminPage";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const state = vi.hoisted(() => ({
  path: "/admin",
  admin: true,
  companyId: "company-synthetic",
}));
const evidence = {
  measuredAt: Date.UTC(2026, 10, 21, 12),
  id: "company-synthetic",
  name: "Linden Cleaning",
  contactEmail: "office@synthetic.test",
  ownerContacts: [{ name: "Pat Owner", email: "pat@synthetic.test" }],
  qa: true,
  createdAt: 1,
  billing: {
    plan: "Unknown / unset",
    storedTier: null,
    status: "trialing",
    complimentary: true,
    trial: true,
    promotion: true,
    cancellation: false,
    snapshotAt: null,
    stale: true,
    payment: "Unverified",
    trialEnd: null,
    awardedUntil: null,
  },
  ownerLastSeen: null,
  staffLastSeen: null,
  coverageStart: null,
  engagement7: "Insufficient observation",
  engagement30: "Insufficient observation",
};
const report = {
  topCompanies: [
    { id: "company-synthetic", name: "Linden Cleaning", count: 42 },
  ],
  counts: {
    companies: 24,
    qaCompanies: 2,
    "role:owner": 26,
    "role:manager": 8,
    "role:cleaner": 62,
    "role:maintenance": 9,
    workerProfiles: 72,
    clientIdentities: 93,
    clientRelationships: 118,
    loginAccounts: 108,
    "role:affiliate": 3,
    created7d: 120,
    created30d: 480,
    completed7d: 98,
    completed30d: 390,
    sharedCopies: 12,
    jobRecords: 890,
    "plan:Unknown / unset": 3,
    "plan:Solo": 6,
    "plan:Team": 9,
    "plan:Pro": 6,
    trial: 5,
    promotion: 2,
    complimentary: 2,
    paymentUnverified: 24,
    "engagement7:Insufficient observation": 24,
    "engagement30:Insufficient observation": 24,
  },
  asOf: Date.UTC(2026, 10, 21, 12),
  finishedAt: Date.UTC(2026, 10, 21, 12),
  pages: 18,
  observationStart: null,
};
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "admin-synthetic", isSuperadmin: state.admin },
    sessionToken: "synthetic-token",
    isLoading: false,
  }),
}));
vi.mock("wouter", () => ({
  useLocation: () => [state.path],
  useRoute: () => [
    state.path.startsWith("/admin/companies/"),
    state.path.startsWith("/admin/companies/")
      ? { companyId: state.companyId }
      : null,
  ],
  Link: ({ href, children, ...props }: { href: string; children: unknown }) =>
    createElement("a", { href, ...props }, children as string),
}));
const runReport = vi.fn(async () => report);
vi.mock("convex/react", () => ({
  useAction: () => runReport,
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(ref);
    if (name.endsWith(":companies"))
      return { page: [evidence], isDone: true, continueCursor: "" };
    if (name.endsWith(":company")) return evidence;
    if (name.endsWith(":people"))
      return {
        page: [
          {
            id: "person",
            name: "Worker Example",
            email: "worker@synthetic.test",
            role: "cleaner",
            status: "active",
          },
        ],
        isDone: true,
        continueCursor: "",
      };
    return undefined;
  },
}));
afterEach(() => {
  state.path = "/admin";
  state.admin = true;
  runReport.mockClear();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

async function renderHub() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  await act(async () => {
    root.render(createElement(SuperAdminPage));
  });
  return { element, unmount: () => act(async () => root.unmount()) };
}
it("shows distinct populations, coverage, unverified billing and existing tools", async () => {
  const view = await renderHub();
  try {
    expect(view.element.textContent).toContain("Client portal identities");
    expect(view.element.textContent).toContain("Operational worker profiles");
    expect(view.element.textContent).toContain("Payment unverified");
    expect(view.element.textContent).toContain("Insufficient observation");
    expect(view.element.textContent).toContain("Top Companies by Jobs");
    expect(view.element.textContent).toContain("42 jobs");
    expect(
      view.element.querySelector(
        'a[href="/admin/companies/company-synthetic"]',
      ),
    ).not.toBeNull();
    for (const href of [
      "/admin/assessments",
      "/admin/giveaways",
      "/admin/affiliates",
    ])
      expect(view.element.querySelector(`a[href="${href}"]`)).not.toBeNull();
    // Optional local, synthetic-only visual artifact. Never served by the application.
    if (process.env.SCRUB_HUB_PREVIEW_DIR) {
      const folder = resolve(process.env.SCRUB_HUB_PREVIEW_DIR);
      mkdirSync(folder, { recursive: true });
      const assets = resolve("packages/frontend/dist/assets");
      const css = readdirSync(assets)
        .filter((file) => file.endsWith(".css"))
        .map((file) => readFileSync(resolve(assets, file), "utf8"))
        .join("\n");
      writeFileSync(
        resolve(folder, "index.html"),
        `<!doctype html><html lang="en"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hub V2 — synthetic UI preview</title><style>${css}</style><body class="bg-gray-50"><main class="p-4 md:p-8">${view.element.innerHTML}</main></body></html>`,
      );
    }
  } finally {
    await view.unmount();
  }
});
it("provides ranking loading and empty states", () => {
  expect(renderToStaticMarkup(createElement(TopCompanies))).toContain(
    "Calculating company ranking",
  );
  expect(
    renderToStaticMarkup(createElement(TopCompanies, { companies: [] })),
  ).toContain("No canonical jobs found");
});
it("preserves company owner email and worker contact/status visibility", async () => {
  state.path = "/admin/companies";
  let view = await renderHub();
  try {
    expect(view.element.textContent).toContain("pat@synthetic.test");
    expect(view.element.textContent).toContain("No staff accounts");
  } finally {
    await view.unmount();
  }
  state.path = "/admin/companies/company-synthetic";
  view = await renderHub();
  try {
    expect(view.element.textContent).toContain("worker@synthetic.test");
    expect(view.element.textContent).toContain("cleaner");
    expect(view.element.textContent).toContain("active");
  } finally {
    await view.unmount();
  }
});
it("does not request reports for an unauthorized viewer", async () => {
  state.admin = false;
  const view = await renderHub();
  try {
    expect(view.element.textContent).toBe("");
    expect(runReport).not.toHaveBeenCalled();
  } finally {
    await view.unmount();
  }
});
