export type ClientDocumentRow = {
  id: string; type: "proposal" | "service_agreement"; title: string;
  clientName?: string | null; businessName?: string | null; address?: string | null;
  status: string; issueNumber?: number | null; hasHistory: boolean;
  provenance: "working" | "issued_snapshot" | "legacy_current";
  date?: number | null; dateKind: string; href?: string | null; destination: "request" | "account";
};

export function filterClientDocuments(rows: ClientDocumentRow[], search: string, type: string, status: string) {
  const term = search.trim().toLocaleLowerCase();
  return rows.filter((row) =>
    (type === "all" || row.type === type) &&
    (status === "all" || row.status === status) &&
    (!term || [row.title, row.clientName, row.businessName, row.address]
      .some((value) => value?.toLocaleLowerCase().includes(term))));
}
