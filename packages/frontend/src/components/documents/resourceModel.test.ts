import { describe, expect, it } from "vitest";
import { filterResources, resourceFileError, resourceSiteUrl, type ResourceRow } from "./resourceModel";
import en from "../../i18n/en/common.json";
import es from "../../i18n/es/common.json";
import { RESOURCE_MAX_BYTES, RESOURCE_MAX_MEGABYTES } from "../../../../../convex/lib/companyResources";

const rows: ResourceRow[] = [
  { _id: "1", title: "Welcome Guide", description: "Arrival tips", originalFileName: "welcome.pdf", mimeType: "application/pdf", sizeBytes: 100, status: "active", storageId: "s1", createdAt: 1, updatedAt: 2 },
  { _id: "2", title: "Policy", description: "Cleaning", originalFileName: "política.png", mimeType: "image/png", sizeBytes: 100, status: "active", storageId: "s2", createdAt: 1, updatedAt: 1 },
];

describe("Resource section model", () => {
  it("searches title, description and filename case-insensitively", () => {
    for (const term of ["WELCOME", "arrival", "welcome.pdf"]) expect(filterResources(rows, term).map((row) => row._id)).toEqual(["1"]);
    expect(filterResources(rows, "POLÍTICA").map((row) => row._id)).toEqual(["2"]);
    expect(filterResources(rows, "")).toHaveLength(2);
  });
  it("checks supported types and file size before upload", () => {
    const file = (name: string, type: string, size: number) => new File([new Uint8Array(size)], name, { type });
    expect(resourceFileError(file("a.pdf", "application/pdf", 1))).toBeNull();
    expect(resourceFileError(file("a.jpeg", "image/jpeg", 1))).toBeNull();
    expect(resourceFileError(file("a.webp", "", 1))).toBeNull();
    expect(resourceFileError(file("a.svg", "image/svg+xml", 1))).toBe("type");
    expect(resourceFileError(file("a.pdf", "image/png", 1))).toBe("type");
    expect(resourceFileError(file("a.pdf", "application/pdf", 0))).toBe("size");
    const sizedFile = (size: number) => ({ name: "a.pdf", type: "application/pdf", size }) as File;
    expect(RESOURCE_MAX_MEGABYTES).toBe(50);
    expect(resourceFileError(sizedFile(10 * 1024 * 1024 + 1))).toBeNull();
    expect(resourceFileError(sizedFile(RESOURCE_MAX_BYTES))).toBeNull();
    expect(resourceFileError(sizedFile(RESOURCE_MAX_BYTES + 1))).toBe("size");
  });
  it("resolves the resource HTTP site and has English/Spanish copy", () => {
    expect(resourceSiteUrl("https://happy-raven.convex.cloud")).toBe("https://happy-raven.convex.site");
    expect(resourceSiteUrl("https://happy-raven.convex.cloud", "https://resources.example/")).toBe("https://resources.example");
    for (const locale of [en, es]) for (const key of ["add", "replace", "archive", "restore", "delete", "open", "download", "empty", "archivedEmpty", "typeError", "sizeError", "deleteConfirm"] as const) {
      expect(locale.resourcesHub[key]).toBeTruthy();
    }
    for (const locale of [en, es]) for (const key of ["fileHint", "replaceHint", "sizeError"] as const) {
      expect(locale.resourcesHub[key]).toContain("50 MB");
    }
  });
});
