import { describe, expect, it } from "vitest";
import { filterClientDocuments, type ClientDocumentRow } from "./clientDocumentModel";
import { getActiveDocumentSection, getDocumentSections } from "./documentSections";
import en from "../../i18n/en/common.json";
import es from "../../i18n/es/common.json";

const rows: ClientDocumentRow[] = [
  { id: "p", type: "proposal", title: "Office Cleaning", clientName: "Alice", businessName: "Acme", address: "1 Main St", status: "draft", issueNumber: null, hasHistory: false, provenance: "working", date: 1, dateKind: "updated", href: "/requests/p", destination: "request" },
  { id: "a", type: "service_agreement", title: "Retail Service", clientName: "Bob", businessName: "Shop Co", address: "9 Pine Ave", status: "acknowledged", issueNumber: 2, hasHistory: true, provenance: "issued_snapshot", date: 2, dateKind: "acknowledged", href: "/requests/a", destination: "request" },
];

describe("Documents Hub access and filtering", () => {
  it("shows the first authorized section and hides other capabilities", () => {
    expect(getDocumentSections({ role: "owner" })).toEqual(["client", "team", "templates"]);
    expect(getDocumentSections({ role: "manager", canManageSalesAndCommercial: true })).toEqual(["client"]);
    expect(getDocumentSections({ role: "manager", canManageDocuments: true })).toEqual(["team", "templates"]);
    expect(getDocumentSections({ role: "manager", canManageSalesAndCommercial: true, canManageDocuments: true })).toEqual(["client", "team", "templates"]);
    expect(getDocumentSections({ role: "manager", canManageTeam: true } as any)).toEqual([]);
    expect(getActiveDocumentSection(["team", "templates"], "client")).toBe("team");
    expect(getActiveDocumentSection(["client", "team", "templates"], "templates")).toBe("templates");
  });

  it("searches title, client, business and address without case sensitivity", () => {
    for (const term of ["OFFICE", "alice", "ACME", "main st"]) {
      expect(filterClientDocuments(rows, term, "all", "all").map((row) => row.id)).toEqual(["p"]);
    }
  });

  it("combines type and status filters", () => {
    expect(filterClientDocuments(rows, "", "service_agreement", "acknowledged").map((row) => row.id)).toEqual(["a"]);
    expect(filterClientDocuments(rows, "", "proposal", "acknowledged")).toEqual([]);
  });

  it("provides every Hub label in English and Spanish", () => {
    for (const locale of [en, es]) {
      const hub = locale.documentsHub;
      for (const key of ["client", "team", "templates", "searchPlaceholder", "allTypes", "allStatuses", "clientEmpty", "teamEmpty", "manageWorkerPdfs", "showHistory", "openRequest", "legacyContent"] as const) {
        expect(hub[key]).toBeTruthy();
      }
      for (const status of ["draft", "ready", "sent", "accepted", "acknowledged", "signed_received", "declined", "cancelled"] as const) {
        expect(hub.statuses[status]).toBeTruthy();
      }
    }
  });
});
