import type { OwnerDashboardViewModel } from "../../features/owner-dashboard/ownerDashboardViewModel";
import { brightSideCompany, brightSideProperties } from "./brightSideEntities";

// All people, businesses, properties, activity, and identifiers below are fictional.
// This deterministic fixture exists only for SCRUB Demo Mode and marketing presentation.
export const brightSideOwnerDashboardFixture = {
  viewer: {
    firstName: "Maya",
    companyName: brightSideCompany.name,
  },
  metrics: [
    { key: "properties", value: 24, tone: "default" },
    { key: "teamMembers", value: 9, tone: "default" },
    { key: "activeJobs", value: 18, tone: "default" },
    { key: "openRedFlags", value: 3, tone: "danger" },
    { key: "awaitingApproval", value: 4, tone: "warning" },
    { key: "openMaintenance", value: 2, tone: "default" },
  ],
  onboarding: {
    completed: 3,
    total: 4,
    steps: [
      { id: "first-property", labelKey: "dashboard.createFirstProperty", completed: true },
      { id: "first-team-member", labelKey: "dashboard.addFirstTeamMember", completed: true },
      { id: "first-job", labelKey: "dashboard.scheduleFirstJob", completed: true },
      { id: "gold-standard", labelKey: "dashboard.readGoldStandard", completed: false },
    ],
  },
  upcomingJobs: [
    {
      id: "job-riverstone-turnover",
      propertyName: brightSideProperties.riverstoneRetreat.name,
      scheduleLabel: "Today · 9:00 AM",
      type: "turnover",
      status: "in_progress",
    },
    {
      id: "job-linden-standard",
      propertyName: brightSideProperties.lindenHouse.name,
      scheduleLabel: "Today · 11:30 AM",
      type: "standard",
      status: "confirmed",
    },
    {
      id: "job-harbor-deep-clean",
      propertyName: brightSideProperties.harborviewCottage.name,
      scheduleLabel: "Tomorrow · 8:00 AM",
      type: "deep_clean",
      status: "scheduled",
    },
    {
      id: "job-maple-maintenance",
      propertyName: "Maple & Main Offices",
      scheduleLabel: "Tomorrow · 1:30 PM",
      type: "maintenance",
      status: "submitted",
    },
    {
      id: "job-sunroom-standard",
      propertyName: "The Sunroom Bungalow",
      scheduleLabel: "Monday · 10:00 AM",
      type: "standard",
      status: "confirmed",
    },
  ],
  recentRedFlags: [
    {
      id: "flag-riverstone-linen",
      note: "Fresh linen set is missing from the primary suite",
      category: "cleanliness",
      severity: "medium",
      status: "open",
    },
    {
      id: "flag-harbor-railing",
      note: "Loose porch railing needs maintenance review",
      category: "safety",
      severity: "high",
      status: "acknowledged",
    },
    {
      id: "flag-maple-faucet",
      note: "Breakroom faucet has a slow leak",
      category: "maintenance",
      severity: "low",
      status: "in_progress",
    },
  ],
} satisfies OwnerDashboardViewModel;

export const ownerDashboardFixtures = {
  canonical: brightSideOwnerDashboardFixture,
} as const;
