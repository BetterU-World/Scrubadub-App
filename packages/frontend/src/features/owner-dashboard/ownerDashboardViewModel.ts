export type OwnerDashboardMetricKey =
  | "properties"
  | "teamMembers"
  | "activeJobs"
  | "openRedFlags"
  | "awaitingApproval"
  | "openMaintenance";

export type OwnerDashboardMetricTone = "default" | "warning" | "danger";

export interface OwnerDashboardMetric {
  key: OwnerDashboardMetricKey;
  value: number | string;
  tone: OwnerDashboardMetricTone;
  destination?: string;
}

export interface OwnerDashboardOnboardingStep {
  id: string;
  labelKey: string;
  completed: boolean;
  destination?: string;
}

export interface OwnerDashboardViewModel {
  viewer: {
    firstName: string;
    companyName: string;
  };
  metrics: OwnerDashboardMetric[];
  onboarding: {
    completed: number;
    total: number;
    steps: OwnerDashboardOnboardingStep[];
  } | null;
  upcomingJobs: Array<{
    id: string;
    propertyName: string;
    scheduleLabel: string;
    type:
      | "standard"
      | "deep_clean"
      | "turnover"
      | "move_in_out"
      | "maintenance"
      | "post_construction";
    status:
      | "scheduled"
      | "confirmed"
      | "denied"
      | "in_progress"
      | "submitted"
      | "approved"
      | "rework_requested"
      | "cancelled";
    destination?: string;
  }>;
  recentRedFlags: Array<{
    id: string;
    note: string;
    category: "damage" | "safety" | "cleanliness" | "maintenance" | "inspection" | "other";
    severity: "low" | "medium" | "high" | "critical";
    status: "open" | "acknowledged" | "in_progress" | "resolved" | "wont_fix";
  }>;
}

export type OwnerDashboardInteractionMode = "production" | "static";
