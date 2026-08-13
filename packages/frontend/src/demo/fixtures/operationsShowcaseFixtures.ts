import { brightSideCompany, brightSideProperties } from "./brightSideEntities";
import { brightSideWorkerJobs } from "./workerShowcaseFixtures";
import {
  showcaseBilling,
  showcaseClient,
  showcaseRequests,
} from "./clientShowcaseFixtures";

export const showcaseWorkers = [
  {
    id: "elena",
    name: "Elena Ruiz",
    role: "Lead cleaner",
    status: "On job",
    team: "Blue Ridge Team",
    jobsThisWeek: 6,
    nextJobId: "riverstone-turnover",
  },
  {
    id: "maya",
    name: "Maya Brooks",
    role: "Cleaner",
    status: "Available",
    team: "Blue Ridge Team",
    jobsThisWeek: 5,
    nextJobId: "linden-standard",
  },
  {
    id: "jonah",
    name: "Jonah Price",
    role: "Maintenance",
    status: "Available",
    team: "Property care",
    jobsThisWeek: 3,
    nextJobId: "harbor-deep-clean",
  },
] as const;

export const showcaseProperties = [
  {
    id: "riverstone",
    ...brightSideProperties.riverstoneRetreat,
    client: "Oak & Pine Stays",
    type: "vacation_rental",
    cadence: "Turnover as booked",
    nextService: "Aug 2 · 9:00 AM",
    jobId: "riverstone-turnover",
    bedrooms: 4,
    baths: 3,
    active: true,
    amenities: ["Hot tub", "Game room", "Mountain view", "Fireplace"],
    notes: "Guest arrival at 4:00 PM; linen reset included.",
  },
  {
    id: "linden",
    ...brightSideProperties.lindenHouse,
    client: showcaseClient.displayName,
    type: "residential",
    cadence: "Every other Monday",
    nextService: "Aug 2 · 11:30 AM",
    jobId: "linden-standard",
    bedrooms: 3,
    baths: 2,
    active: true,
    amenities: ["Pets", "Home office", "Interior windows"],
    notes: "Use fragrance-free products in the primary suite.",
  },
  {
    id: "harborview",
    ...brightSideProperties.harborviewCottage,
    client: "Harborview Hosts",
    type: "vacation_rental",
    cadence: "Weekly in season",
    nextService: "Aug 3 · 8:00 AM",
    jobId: "harbor-deep-clean",
    bedrooms: 3,
    baths: 2,
    active: true,
    amenities: ["Beach access", "Outdoor shower", "Linen service"],
    notes: "Deep clean before the August owner stay.",
  },
  {
    id: "sunroom",
    ...brightSideProperties.sunroomBungalow,
    client: "Nora Ellis",
    type: "residential",
    cadence: "Monthly",
    nextService: "Aug 29 · 10:00 AM",
    jobId: "sunroom-approved",
    bedrooms: 2,
    baths: 1,
    active: true,
    amenities: ["Plants", "Fragrance free"],
    notes: "Completed service is ready for owner review.",
  },
] as const;

export const showcaseClients = [
  {
    id: "sarah-johnson",
    name: showcaseClient.displayName,
    business: "Johnson Studio",
    email: showcaseClient.email,
    phone: showcaseClient.phone,
    type: "residential",
    status: "active",
    locations: 2,
    services: "Residential + studio",
    propertyId: "linden",
    requestId: "request-scheduled",
    updated: "Aug 2, 2026",
  },
  {
    id: "oak-pine",
    name: "Morgan Lee",
    business: "Oak & Pine Stays",
    email: "morgan@oakandpine.example",
    phone: "(555) 010-2122",
    type: "property_manager",
    status: "active",
    locations: 2,
    services: "Vacation rental turnovers",
    propertyId: "riverstone",
    requestId: "request-submitted",
    updated: "Aug 1, 2026",
  },
  {
    id: "harborview-hosts",
    name: "Avery Chen",
    business: "Harborview Hosts",
    email: "avery@harborview.example",
    phone: "(555) 010-2088",
    type: "str",
    status: "active",
    locations: 1,
    services: "Seasonal rental care",
    propertyId: "harborview",
    requestId: "request-completed",
    updated: "Jul 29, 2026",
  },
] as const;

export const showcaseCommercialAccounts = [
  {
    id: "johnson-studio",
    name: "Johnson Design Studio",
    contact: showcaseClient.displayName,
    status: "Active",
    location: "218 Market Street, Asheville, NC",
    cadence: "Tuesday and Friday evenings",
    monthlyValueCents: 152000,
    invoiceId: "invoice-overdue",
    nextService: "Aug 4 · 6:30 PM",
  },
  {
    id: "maple-main",
    name: "Maple & Main Offices",
    contact: "Theo Martin",
    status: "Active",
    location: "310 Broadway Street, Asheville, NC",
    cadence: "Weeknights",
    monthlyValueCents: 238000,
    invoiceId: "invoice-issued",
    nextService: "Aug 3 · 7:00 PM",
  },
] as const;

export const showcaseOwnerRequests = showcaseRequests.map((request, index) => ({
  id: request._id,
  service: request.requestedService,
  client: index === 0 ? "Morgan Lee" : showcaseClient.displayName,
  property:
    index === 0
      ? brightSideProperties.riverstoneRetreat.name
      : brightSideProperties.lindenHouse.name,
  status: request.status,
  requestedDate: request.requestedDate,
  scheduledJobId: request.scheduledService?._id,
  clientId: index === 0 ? "oak-pine" : "sarah-johnson",
  propertyId: index === 0 ? "riverstone" : "linden",
  source: index === 0 ? "Public request form" : "Client Portal",
}));

export const showcasePropertyOperations = {
  riverstone: {
    access: "Use lockbox code 4821; return key after final walkthrough.",
    parking: "Two vehicles in the upper gravel drive.",
    cleaning:
      "Photograph hot tub cover, reset all four bedrooms, and stage the welcome basket.",
    linens: { king: 2, queen: 4, twin: 4, bathSets: 8 },
    inventory: [
      ["Guest supplies", "Toilet paper", 18, 12],
      ["Guest supplies", "Paper towels", 8, 6],
      ["Linens", "King sheet sets", 4, 4],
      ["Cleaning", "Dishwasher tabs", 22, 15],
    ],
    history: [
      ["Aug 2", "Turnover started", "Elena Ruiz"],
      ["Jul 29", "Welcome baskets restocked", "Maya Brooks"],
      ["Jul 27", "Loose porch railing flagged", "Elena Ruiz"],
    ],
    issue: "Loose porch railing needs maintenance review",
  },
  linden: {
    access: "Client will leave the side door unlocked.",
    parking: "Street parking; avoid blocking the shared drive.",
    cleaning:
      "Use fragrance-free products and include interior windows on deep cleans.",
    linens: { king: 1, queen: 2, twin: 0, bathSets: 4 },
    inventory: [
      ["Guest supplies", "Hand soap", 5, 3],
      ["Cleaning", "Fragrance-free spray", 3, 2],
      ["Linens", "Queen sheet sets", 3, 2],
    ],
    history: [
      ["Aug 2", "Standard clean confirmed", "Maya Brooks"],
      ["Jul 20", "Service approved", "Elena Ruiz"],
      ["Jul 18", "Deep-clean proposal accepted", "Sarah Johnson"],
    ],
    issue: null,
  },
} as const;

export const showcaseRequestWorkflow = {
  "request-scheduled": {
    walkthrough: {
      status: "completed",
      schedule: "July 29 · 2:00 PM",
      notes: "Interior windows and kitchen detail added after walkthrough.",
    },
    proposal: {
      status: "accepted",
      title: "Linden House Deep Clean",
      priceCents: 28500,
      scope:
        "Kitchen detail, guest bath, interior windows, and whole-home deep clean.",
    },
    agreement: {
      status: "signed",
      title: "Residential Cleaning Service Agreement",
      date: "July 31",
    },
    timeline: [
      ["Jul 28", "Request submitted"],
      ["Jul 29", "Walkthrough completed"],
      ["Jul 29", "Proposal sent"],
      ["Jul 30", "Proposal accepted"],
      ["Jul 31", "Service agreement signed"],
      ["Aug 1", "Job confirmed for Aug 17"],
    ],
  },
  "request-submitted": {
    walkthrough: {
      status: "scheduled",
      schedule: "August 5 · 11:00 AM",
      notes: "Review turnover standards and linen storage.",
    },
    proposal: null,
    agreement: null,
    timeline: [
      ["Aug 2", "Request submitted"],
      ["Aug 3", "Walkthrough scheduled"],
    ],
  },
  "request-completed": {
    walkthrough: null,
    proposal: {
      status: "accepted",
      title: "Recurring Standard Cleaning",
      priceCents: 14500,
      scope: "Biweekly standard cleaning.",
    },
    agreement: {
      status: "signed",
      title: "Residential Cleaning Service Agreement",
      date: "July 12",
    },
    timeline: [
      ["Jul 10", "Request submitted"],
      ["Jul 11", "Request reviewed"],
      ["Jul 12", "Agreement signed"],
      ["Jul 20", "Service completed and approved"],
    ],
  },
} as const;

export function getShowcasePropertyOperations(id: string) {
  return showcasePropertyOperations[
    id as keyof typeof showcasePropertyOperations
  ];
}
export function getShowcaseRequestWorkflow(id: string) {
  return showcaseRequestWorkflow[id as keyof typeof showcaseRequestWorkflow];
}

export const showcaseInvoices = showcaseBilling.invoices.map((invoice) => ({
  ...invoice,
  client:
    invoice._id === "invoice-overdue"
      ? "Johnson Design Studio"
      : showcaseClient.displayName,
}));

export const showcaseSchedule = brightSideWorkerJobs.map((job, index) => ({
  ...job,
  worker: index < 2 ? "Elena Ruiz" : index === 2 ? "Maya Brooks" : "Elena Ruiz",
  client:
    index === 0
      ? "Oak & Pine Stays"
      : index === 1
        ? showcaseClient.displayName
        : index === 2
          ? "Harborview Hosts"
          : "Nora Ellis",
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

export function getShowcaseProperty(id: string) {
  return showcaseProperties.find((item) => item.id === id);
}
export function getShowcaseWorker(id: string) {
  return showcaseWorkers.find((item) => item.id === id);
}
export function getShowcaseClient(id: string) {
  return showcaseClients.find((item) => item.id === id);
}
export function getShowcaseCommercialAccount(id: string) {
  return showcaseCommercialAccounts.find((item) => item.id === id);
}
export function getShowcaseOwnerRequest(id: string) {
  return showcaseOwnerRequests.find((item) => item.id === id);
}
