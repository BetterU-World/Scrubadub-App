import type { WorkerHomeViewModel } from "../../features/worker-home/workerHomeViewModel";
import type { ShowcaseWorkerJobPreviewModel } from "../ShowcaseWorkerJobPreview";
import { brightSideCompany, brightSideProperties } from "./brightSideEntities";

export const brightSideWorkerHomeFixture = {
  worker: { name: "Elena", role: "cleaner", companyName: brightSideCompany.name },
  attentionCount: 5,
  todayJobs: [{ id: "job-riverstone-turnover", propertyName: brightSideProperties.riverstoneRetreat.name, propertyAddress: brightSideProperties.riverstoneRetreat.address, scheduledDate: "2026-08-02", startTime: "9:00 AM", status: "in_progress", type: "turnover", assignedTeamName: "Blue Ridge Team" }],
  activeJobs: [{ id: "job-riverstone-turnover", propertyName: brightSideProperties.riverstoneRetreat.name, propertyAddress: brightSideProperties.riverstoneRetreat.address, scheduledDate: "2026-08-02", startTime: "9:00 AM", status: "in_progress", type: "turnover", assignedTeamName: "Blue Ridge Team" }],
  upcomingJobs: [
    { id: "job-linden-standard", propertyName: brightSideProperties.lindenHouse.name, propertyAddress: brightSideProperties.lindenHouse.address, scheduledDate: "2026-08-02", startTime: "11:30 AM", status: "confirmed", type: "standard", assignedTeamName: "Blue Ridge Team" },
    { id: "job-harbor-deep-clean", propertyName: brightSideProperties.harborviewCottage.name, propertyAddress: brightSideProperties.harborviewCottage.address, scheduledDate: "2026-08-03", startTime: "8:00 AM", status: "scheduled", type: "deep_clean" },
  ],
  recentJobs: [{ id: "job-sunroom-approved", propertyName: "The Sunroom Bungalow", scheduledDate: "2026-08-01", startTime: "10:00 AM", status: "approved", type: "standard", assignedTeamName: "Blue Ridge Team" }],
  notifications: { unreadCount: 2 },
  teams: [{ id: "team-blue-ridge", name: "Blue Ridge Team", description: "Turnovers and residential cleaning" }],
  performance: { activeJobs: 3, jobsAwaitingReview: 1, jobsCompleted: 18, jobsRequiringRework: 0 },
  payments: [
    { id: "payment-riverstone", jobLabel: "Riverstone Retreat turnover", paymentStatus: "PLANNED", plannedPayCents: 14500 },
    { id: "payment-sunroom", jobLabel: "The Sunroom Bungalow", paymentStatus: "PAID", plannedPayCents: 11000 },
  ],
  onboarding: {
    profile: { onboardingStatus: "in_progress", jobEligibilityStatus: "eligible" },
    documents: [{ id: "document-handbook", status: "reviewed", required: true }],
    items: [{ id: "onboarding-safety", title: "Review updated safety policy", status: "pending", required: true }],
  },
} satisfies WorkerHomeViewModel;

export const brightSideWorkerJobPreviewFixture = {
  propertyName: brightSideProperties.riverstoneRetreat.name,
  address: brightSideProperties.riverstoneRetreat.address,
  scheduleLabel: "Today · 9:00 AM",
  jobTypeLabel: "Turnover cleaning",
  status: "in_progress",
  teamLabel: "Blue Ridge Team",
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
