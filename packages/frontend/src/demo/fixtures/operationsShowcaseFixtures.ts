import { brightSideCompany, brightSideProperties } from "./brightSideEntities";
import { brightSideWorkerJobs } from "./workerShowcaseFixtures";
import { showcaseBilling, showcaseClient, showcaseRequests } from "./clientShowcaseFixtures";

export const showcaseWorkers = [
  { id: "elena", name: "Elena Ruiz", role: "Lead cleaner", status: "On job", team: "Blue Ridge Team", jobsThisWeek: 6, nextJobId: "riverstone-turnover" },
  { id: "maya", name: "Maya Brooks", role: "Cleaner", status: "Available", team: "Blue Ridge Team", jobsThisWeek: 5, nextJobId: "linden-standard" },
  { id: "jonah", name: "Jonah Price", role: "Maintenance", status: "Available", team: "Property care", jobsThisWeek: 3, nextJobId: "harbor-deep-clean" },
] as const;

export const showcaseProperties = [
  { id: "riverstone", ...brightSideProperties.riverstoneRetreat, client: "Oak & Pine Stays", type: "Vacation rental", cadence: "Turnover as booked", nextService: "Aug 2 · 9:00 AM", jobId: "riverstone-turnover", bedrooms: 4, notes: "Guest arrival at 4:00 PM; linen reset included." },
  { id: "linden", ...brightSideProperties.lindenHouse, client: showcaseClient.displayName, type: "Residential", cadence: "Every other Monday", nextService: "Aug 2 · 11:30 AM", jobId: "linden-standard", bedrooms: 3, notes: "Use fragrance-free products in the primary suite." },
  { id: "harborview", ...brightSideProperties.harborviewCottage, client: "Harborview Hosts", type: "Vacation rental", cadence: "Weekly in season", nextService: "Aug 3 · 8:00 AM", jobId: "harbor-deep-clean", bedrooms: 3, notes: "Deep clean before the August owner stay." },
  { id: "sunroom", ...brightSideProperties.sunroomBungalow, client: "Nora Ellis", type: "Residential", cadence: "Monthly", nextService: "Aug 29 · 10:00 AM", jobId: "sunroom-approved", bedrooms: 2, notes: "Completed service is ready for owner review." },
] as const;

export const showcaseClients = [
  { id: "sarah-johnson", name: showcaseClient.displayName, business: "Johnson Studio", status: "Active", locations: 2, services: "Residential + studio", propertyId: "linden", requestId: "request-scheduled" },
  { id: "oak-pine", name: "Morgan Lee", business: "Oak & Pine Stays", status: "Active", locations: 2, services: "Vacation rental turnovers", propertyId: "riverstone", requestId: "request-submitted" },
  { id: "harborview-hosts", name: "Avery Chen", business: "Harborview Hosts", status: "Active", locations: 1, services: "Seasonal rental care", propertyId: "harborview", requestId: "request-completed" },
] as const;

export const showcaseCommercialAccounts = [
  { id: "johnson-studio", name: "Johnson Design Studio", contact: showcaseClient.displayName, status: "Active", location: "218 Market Street, Asheville, NC", cadence: "Tuesday and Friday evenings", monthlyValueCents: 152000, invoiceId: "invoice-overdue", nextService: "Aug 4 · 6:30 PM" },
  { id: "maple-main", name: "Maple & Main Offices", contact: "Theo Martin", status: "Active", location: "310 Broadway Street, Asheville, NC", cadence: "Weeknights", monthlyValueCents: 238000, invoiceId: "invoice-issued", nextService: "Aug 3 · 7:00 PM" },
] as const;

export const showcaseOwnerRequests = showcaseRequests.map((request, index) => ({
  id: request._id,
  service: request.requestedService,
  client: index === 0 ? "Morgan Lee" : showcaseClient.displayName,
  property: index === 0 ? brightSideProperties.riverstoneRetreat.name : brightSideProperties.lindenHouse.name,
  status: request.status,
  requestedDate: request.requestedDate,
  scheduledJobId: request.scheduledService?._id,
}));

export const showcaseInvoices = showcaseBilling.invoices.map((invoice) => ({
  ...invoice,
  client: invoice._id === "invoice-overdue" ? "Johnson Design Studio" : showcaseClient.displayName,
}));

export const showcaseSchedule = brightSideWorkerJobs.map((job, index) => ({
  ...job,
  worker: index < 2 ? "Elena Ruiz" : index === 2 ? "Maya Brooks" : "Elena Ruiz",
  client: index === 0 ? "Oak & Pine Stays" : index === 1 ? showcaseClient.displayName : index === 2 ? "Harborview Hosts" : "Nora Ellis",
}));

export const showcaseAnalytics = {
  period: "August 2026 · BrightSide operation",
  metrics: [
    ["Jobs completed", "42", "+6 vs. July"],
    ["On-time arrival", "96%", "+2 points"],
    ["Quality approval", "93%", "39 approved first pass"],
    ["Scheduled revenue", "$12,840", "Residential + commercial"],
  ],
  weeklyJobs: [8, 10, 11, 13],
} as const;

export const showcaseWorkspace = {
  companyName: brightSideCompany.name,
  timezone: "America/New_York",
  serviceArea: "Western North Carolina",
  defaultDuration: "2 hours",
  notifications: "Job changes and client requests",
} as const;

export function getShowcaseProperty(id: string) { return showcaseProperties.find((item) => item.id === id); }
export function getShowcaseWorker(id: string) { return showcaseWorkers.find((item) => item.id === id); }
export function getShowcaseClient(id: string) { return showcaseClients.find((item) => item.id === id); }
export function getShowcaseCommercialAccount(id: string) { return showcaseCommercialAccounts.find((item) => item.id === id); }
export function getShowcaseOwnerRequest(id: string) { return showcaseOwnerRequests.find((item) => item.id === id); }
