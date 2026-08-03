import type { WorkerHomeViewModel } from "../../features/worker-home/workerHomeViewModel";
import type { ShowcaseWorkerJobPreviewModel } from "../ShowcaseWorkerJobPreview";
import { brightSideCompany, brightSideProperties } from "./brightSideEntities";

export interface ShowcaseWorkerJob {
  id: string;
  propertyName: string;
  address: string;
  scheduledDate: string;
  dateLabel: string;
  startTime: string;
  durationMinutes: number;
  status: "in_progress" | "confirmed" | "scheduled" | "approved";
  serviceType: "turnover" | "standard" | "deep_clean";
  serviceTypeLabel: string;
  teamName?: string;
  notes?: string;
  accessInstructions?: string;
  requiredAddOns?: readonly string[];
}

export const RIVERSTONE_SHOWCASE_JOB_ID = "riverstone-turnover";

export const brightSideWorkerJobs = [
  {
    id: RIVERSTONE_SHOWCASE_JOB_ID,
    propertyName: brightSideProperties.riverstoneRetreat.name,
    address: brightSideProperties.riverstoneRetreat.address,
    scheduledDate: "2026-08-02",
    dateLabel: "Today",
    startTime: "9:00 AM",
    durationMinutes: 150,
    status: "in_progress",
    serviceType: "turnover",
    serviceTypeLabel: "Turnover cleaning",
    teamName: "Blue Ridge Team",
    notes: "Reset the home for the afternoon guest arrival and complete the final walkthrough before leaving.",
    accessInstructions: "Use the property entry code in the arrival instructions. Return the key to the lockbox after the final walkthrough.",
    requiredAddOns: ["Linen reset", "Welcome basket placement"],
  },
  {
    id: "linden-standard",
    propertyName: brightSideProperties.lindenHouse.name,
    address: brightSideProperties.lindenHouse.address,
    scheduledDate: "2026-08-02",
    dateLabel: "Today",
    startTime: "11:30 AM",
    durationMinutes: 120,
    status: "confirmed",
    serviceType: "standard",
    serviceTypeLabel: "Standard cleaning",
    teamName: "Blue Ridge Team",
  },
  {
    id: "harbor-deep-clean",
    propertyName: brightSideProperties.harborviewCottage.name,
    address: brightSideProperties.harborviewCottage.address,
    scheduledDate: "2026-08-03",
    dateLabel: "Tomorrow",
    startTime: "8:00 AM",
    durationMinutes: 240,
    status: "scheduled",
    serviceType: "deep_clean",
    serviceTypeLabel: "Deep cleaning",
  },
  {
    id: "sunroom-approved",
    propertyName: brightSideProperties.sunroomBungalow.name,
    address: brightSideProperties.sunroomBungalow.address,
    scheduledDate: "2026-08-01",
    dateLabel: "Yesterday",
    startTime: "10:00 AM",
    durationMinutes: 120,
    status: "approved",
    serviceType: "standard",
    serviceTypeLabel: "Standard cleaning",
    teamName: "Blue Ridge Team",
  },
] as const satisfies readonly ShowcaseWorkerJob[];

export function getBrightSideWorkerJob(showcaseJobId: string): ShowcaseWorkerJob | undefined {
  return brightSideWorkerJobs.find((job) => job.id === showcaseJobId);
}

const toHomeJob = (job: ShowcaseWorkerJob) => ({
  id: job.id,
  propertyName: job.propertyName,
  propertyAddress: job.address,
  scheduledDate: job.scheduledDate,
  startTime: job.startTime,
  status: job.status,
  type: job.serviceType,
  assignedTeamName: job.teamName,
});

const activeJobs = brightSideWorkerJobs.filter((job) => job.status !== "approved");

export const brightSideWorkerHomeFixture = {
  worker: { name: "Elena", role: "cleaner", companyName: brightSideCompany.name },
  attentionCount: 3,
  todayJobs: brightSideWorkerJobs.filter((job) => job.scheduledDate === "2026-08-02").map(toHomeJob),
  activeJobs: activeJobs.map(toHomeJob),
  upcomingJobs: brightSideWorkerJobs.filter((job) => job.scheduledDate > "2026-08-02").map(toHomeJob),
  recentJobs: brightSideWorkerJobs.filter((job) => job.status === "approved").map(toHomeJob),
  notifications: { unreadCount: 2 },
  teams: [{ id: "team-blue-ridge", name: "Blue Ridge Team", description: "Turnovers and residential cleaning" }],
  performance: { activeJobs: activeJobs.length, jobsAwaitingReview: 0, jobsCompleted: 18, jobsRequiringRework: 0 },
  payments: [
    { id: "payment-riverstone", jobLabel: "Riverstone Retreat turnover", paymentStatus: "PLANNED", plannedPayCents: 14500 },
    { id: "payment-sunroom", jobLabel: brightSideProperties.sunroomBungalow.name, paymentStatus: "PAID", plannedPayCents: 11000 },
  ],
  onboarding: {
    profile: { onboardingStatus: "in_progress", jobEligibilityStatus: "eligible" },
    documents: [{ id: "document-handbook", status: "reviewed", required: true }],
    items: [{ id: "onboarding-safety", title: "Review updated safety policy", status: "pending", required: true }],
  },
} satisfies WorkerHomeViewModel;

const riverstoneJob = getBrightSideWorkerJob(RIVERSTONE_SHOWCASE_JOB_ID)!;

export const brightSideWorkerJobPreviewFixture = {
  propertyName: riverstoneJob.propertyName,
  address: riverstoneJob.address,
  scheduleLabel: `${riverstoneJob.dateLabel} · ${riverstoneJob.startTime}`,
  jobTypeLabel: riverstoneJob.serviceTypeLabel,
  status: riverstoneJob.status,
  teamLabel: riverstoneJob.teamName,
  completedChecklistItems: 9,
  totalChecklistItems: 12,
  checklistItems: [
    { id: "kitchen", label: "Kitchen surfaces and appliances", completed: true },
    { id: "primary-suite", label: "Primary suite reset", completed: true },
    { id: "bathrooms", label: "Bathrooms sanitized", completed: true },
    { id: "final-walkthrough", label: "Final walkthrough", completed: false },
  ],
  completedPhotoCount: 3,
  reviewState: "Complete remaining items before submission",
} satisfies ShowcaseWorkerJobPreviewModel;
