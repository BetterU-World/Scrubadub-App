import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("request workflow hotfix contracts", () => {
  const requestDetail = read("packages/frontend/src/pages/owner/RequestDetailPage.tsx");
  const walkthrough = read("packages/frontend/src/components/owner/WalkthroughCard.tsx");

  it("keeps property creation visible and provides classification and result feedback", () => {
    expect(requestDetail).toContain("canAct && request.propertySnapshot?.address");
    expect(requestDetail).toContain('t("requests.propertyClassificationRequired")');
    expect(requestDetail).toContain("request-lead-classification");
    expect(requestDetail).toContain('t("requests.propertyCreatedAndLinked")');
    expect(requestDetail).toContain('t("requests.propertyAlreadyLinked")');
  });

  it("saves the selected enum and requires server confirmation before success feedback", () => {
    expect(requestDetail).toContain("const selectedLeadType = leadTypeVal");
    expect(requestDetail).toContain("leadType: selectedLeadType as any");
    expect(requestDetail).toContain("result.leadType !== selectedLeadType");
    expect(requestDetail).toContain("setLeadTypeVal(result.leadType)");
    expect(requestDetail.indexOf("result.leadType !== selectedLeadType"))
      .toBeLessThan(requestDetail.indexOf('t("requests.leadDetailsSaved")'));
  });

  it("contains long request content and mobile action groups without clipping", () => {
    expect(requestDetail).toContain("min-w-0 break-all text-primary-600");
    expect(requestDetail).toContain("min-w-0 break-words");
    expect(requestDetail).toContain("break-words whitespace-pre-wrap");
    expect(requestDetail).toContain("flex flex-col gap-2 sm:flex-row sm:items-center");
    expect(requestDetail).toContain("w-full items-center justify-center");
    expect(requestDetail).not.toContain("overflow-x-hidden");
  });

  it("stacks walkthrough actions and heading controls below the small breakpoint", () => {
    expect(walkthrough).toContain("flex flex-col gap-2 sm:flex-row");
    expect(walkthrough).toContain("sm:items-center sm:justify-between");
    expect(walkthrough).toContain("w-full items-center justify-center");
  });

  it("defines the Client title and every literal clientRelationships key in both catalogs", () => {
    const en = JSON.parse(read("packages/frontend/src/i18n/en/common.json"));
    const es = JSON.parse(read("packages/frontend/src/i18n/es/common.json"));
    expect(en.clientRelationships.title).toBe("Clients");
    expect(es.clientRelationships.title).toBe("Clientes");

    const sourceFiles = [
      read("packages/frontend/src/pages/owner/ClientRelationshipListPage.tsx"),
      read("packages/frontend/src/pages/owner/ClientRelationshipDetailPage.tsx"),
    ];
    const keys = sourceFiles.flatMap((source) =>
      [...source.matchAll(/t\(["'](clientRelationships\.[^"']+)["']/g)].map((match) => match[1])
    );
    const hasKey = (catalog: any, key: string) => key.split(".").every((part) => (catalog = catalog?.[part]) !== undefined);
    for (const key of keys) {
      expect(hasKey(en, key), `missing English ${key}`).toBe(true);
      expect(hasKey(es, key), `missing Spanish ${key}`).toBe(true);
    }
  });
});
