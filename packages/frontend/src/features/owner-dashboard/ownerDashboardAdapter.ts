import type { OwnerDashboardViewModel } from "./ownerDashboardViewModel";

interface DashboardStats {
  propertyCount: number;
  employeeCount: number;
  activeJobCount: number;
  totalJobCount: number;
  openRedFlagCount: number;
  awaitingApprovalCount: number;
  openMaintenanceCount: number;
  upcomingJobs: Array<{
    _id: string;
    propertyName: string;
    scheduledDate: string;
    type: OwnerDashboardViewModel["upcomingJobs"][number]["type"];
    status: OwnerDashboardViewModel["upcomingJobs"][number]["status"];
  }>;
  recentRedFlags: Array<{
    _id: string;
    note: string;
    category: OwnerDashboardViewModel["recentRedFlags"][number]["category"];
    severity: OwnerDashboardViewModel["recentRedFlags"][number]["severity"];
    status: OwnerDashboardViewModel["recentRedFlags"][number]["status"];
  }>;
}

interface ProductionDashboardInput {
  firstName: string;
  companyName: string;
  stats: DashboardStats | undefined;
  manualRead: boolean;
}

export function adaptProductionOwnerDashboard({
  firstName,
  companyName,
  stats,
  manualRead,
}: ProductionDashboardInput): OwnerDashboardViewModel {
  const steps = [
    {
      id: "first-property",
      labelKey: "dashboard.createFirstProperty",
      destination: "/properties",
      completed: (stats?.propertyCount ?? 0) > 0,
    },
    {
      id: "first-team-member",
      labelKey: "dashboard.addFirstTeamMember",
      destination: "/employees",
      completed: (stats?.employeeCount ?? 0) > 1,
    },
    {
      id: "first-job",
      labelKey: "dashboard.scheduleFirstJob",
      destination: "/jobs/new",
      completed: (stats?.totalJobCount ?? 0) > 0,
    },
    {
      id: "gold-standard",
      labelKey: "dashboard.readGoldStandard",
      destination: "/manuals",
      completed: manualRead,
    },
  ];

  return {
    viewer: { firstName, companyName },
    metrics: [
      { key: "properties", value: stats?.propertyCount ?? "—", tone: "default", destination: "/properties" },
      { key: "teamMembers", value: stats?.employeeCount ?? "—", tone: "default", destination: "/employees" },
      { key: "activeJobs", value: stats?.activeJobCount ?? "—", tone: "default", destination: "/jobs" },
      { key: "openRedFlags", value: stats?.openRedFlagCount ?? "—", tone: "danger", destination: "/red-flags" },
      { key: "awaitingApproval", value: stats?.awaitingApprovalCount ?? "—", tone: "warning", destination: "/jobs?status=submitted" },
      { key: "openMaintenance", value: stats?.openMaintenanceCount ?? "—", tone: "default", destination: "/jobs?type=maintenance" },
    ],
    onboarding: manualRead
      ? null
      : {
          completed: steps.filter((step) => step.completed).length,
          total: steps.length,
          steps,
        },
    upcomingJobs: (stats?.upcomingJobs ?? []).map((job) => ({
      id: job._id,
      propertyName: job.propertyName,
      scheduleLabel: job.scheduledDate,
      type: job.type,
      status: job.status,
      destination: `/jobs/${job._id}`,
    })),
    recentRedFlags: (stats?.recentRedFlags ?? []).map((flag) => ({
      id: flag._id,
      note: flag.note,
      category: flag.category,
      severity: flag.severity,
      status: flag.status,
    })),
  };
}
