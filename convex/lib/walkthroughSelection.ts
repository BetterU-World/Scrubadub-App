type WalkthroughRecord = {
  _id?: unknown;
  _creationTime?: number;
  createdAt?: number;
  status: string;
};

/** Prefer the newest draft, then the newest visible historical assessment. */
export function selectRequestWalkthrough<T extends WalkthroughRecord>(records: readonly T[]): T | undefined {
  return records.filter(record => record.status !== "archived").sort((a, b) =>
    Number(b.status === "draft") - Number(a.status === "draft") ||
    (b._creationTime ?? b.createdAt ?? 0) - (a._creationTime ?? a.createdAt ?? 0) ||
    String(b._id ?? "").localeCompare(String(a._id ?? ""))
  )[0];
}
