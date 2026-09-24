export type ResourceRow = {
  _id: string;
  title: string;
  description?: string;
  storageId: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  status: "active" | "archived";
  createdAt: number;
  updatedAt: number;
};

const extensions: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export function resourceFileError(file: File): "type" | "size" | null {
  if (!file.size || file.size > 10 * 1024 * 1024) return "size";
  const name = file.name.toLowerCase();
  if (!file.type) return /\.(pdf|jpe?g|png|webp)$/.test(name) ? null : "type";
  const extension = extensions[file.type];
  if (!extension || !(name.endsWith(extension) ||
    (file.type === "image/jpeg" && name.endsWith(".jpeg")))) return "type";
  return null;
}

export function filterResources(rows: ResourceRow[], search: string): ResourceRow[] {
  const term = search.trim().toLocaleLowerCase();
  return term ? rows.filter((row) => [row.title, row.description, row.originalFileName]
    .some((value) => value?.toLocaleLowerCase().includes(term))) : rows;
}

export function resourceSiteUrl(convexUrl: string, explicit?: string): string {
  if (explicit) return explicit.replace(/\/$/, "");
  const url = new URL(convexUrl);
  if (!url.hostname.endsWith(".convex.cloud")) throw new Error("Resource service URL is unavailable");
  url.hostname = url.hostname.replace(/\.convex\.cloud$/, ".convex.site");
  return url.origin;
}
