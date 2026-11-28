// Shared by the Convex inspection lifecycle and the Vercel Node.js worker.
export const PDF_POLICY = "static-pdf-v1";
export const PDF_INSPECTOR = "qpdf-12.4.2";
export const PDF_LIMITS = {
  bytes: 10 * 1024 * 1024, entries: 10, title: 100, description: 320,
  companyHourly: 10, daily: 250, concurrent: 3, attempts: 2,
  leaseMs: 120_000, downloadBytesHourly: 128 * 1024 * 1024,
} as const;
