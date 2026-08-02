export interface WorkerJobSummary {
  id: string;
  propertyName?: string | null;
  propertyAddress?: string | null;
  scheduledDate: string;
  startTime?: string | null;
  status: string;
  type?: string;
  assignedTeamName?: string | null;
}

export interface WorkerTeamSummary {
  id: string;
  name: string;
  description?: string | null;
}

export interface WorkerPaymentSummary {
  id: string;
  jobLabel: string;
  paymentStatus: string;
  plannedPayCents?: number | null;
}

export interface WorkerOnboardingItemSummary {
  id: string;
  title: string;
  status: string;
  required?: boolean;
}

export interface WorkerDocumentSummary {
  id: string;
  status: string;
  required?: boolean;
}

export interface WorkerHomeViewModel {
  worker: {
    name: string;
    role: "cleaner" | "maintenance";
    companyName?: string;
  };
  attentionCount: number;
  todayJobs: WorkerJobSummary[];
  activeJobs: WorkerJobSummary[];
  upcomingJobs: WorkerJobSummary[];
  recentJobs: WorkerJobSummary[];
  notifications: { unreadCount: number };
  teams: WorkerTeamSummary[];
  performance: {
    activeJobs: number;
    jobsAwaitingReview: number;
    jobsCompleted: number;
    jobsRequiringRework: number;
  };
  payments: WorkerPaymentSummary[];
  onboarding: {
    profile: { onboardingStatus?: string | null; jobEligibilityStatus?: string | null } | null;
    documents: WorkerDocumentSummary[];
    items: WorkerOnboardingItemSummary[];
  };
}

export type WorkerHomeInteractionMode = "production" | "static";
