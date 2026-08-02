import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { getStaffSessionToken, useAuth } from "@/hooks/useAuth";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { WorkerHomePresentation } from "@/features/worker-home/WorkerHomePresentation";
import type { WorkerHomeViewModel, WorkerJobSummary } from "@/features/worker-home/workerHomeViewModel";

type WorkerJob = {
  _id: string;
  propertyName?: string | null;
  propertyAddress?: string | null;
  scheduledDate: string;
  startTime?: string | null;
  status: string;
  type?: string;
  assignedTeamName?: string | null;
};

const ACTIVE_STATUSES = new Set(["scheduled", "confirmed", "in_progress", "rework_requested"]);
const RECENT_STATUSES = new Set(["submitted", "approved"]);

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toJobSummary(job: WorkerJob): WorkerJobSummary {
  return {
    id: job._id,
    propertyName: job.propertyName,
    propertyAddress: job.propertyAddress,
    scheduledDate: job.scheduledDate,
    startTime: job.startTime,
    status: job.status,
    type: job.type,
    assignedTeamName: job.assignedTeamName,
  };
}

export function WorkerHomePage() {
  const { user } = useAuth();
  const today = useMemo(() => todayString(), []);

  const jobs = useQuery(
    api.queries.jobs.getForCleaner,
    user?.companyId ? { cleanerId: user._id, companyId: user.companyId, userId: user._id, sessionToken: getStaffSessionToken() } : "skip"
  ) as WorkerJob[] | undefined;
  const payments = useQuery(
    api.queries.cleanerPayments.listCleanerJobsWithPaymentStatus,
    user?._id ? { userId: user._id, sessionToken: getStaffSessionToken() } : "skip"
  );
  const teams = useQuery(
    (api as any).queries.teams.listMyTeams,
    user?._id ? { userId: user._id, sessionToken: getStaffSessionToken() } : "skip"
  );
  const workerProfile = useQuery(
    (api as any).queries.workers.getWorkerProfileForUser,
    user?._id ? { userId: user._id, sessionToken: getStaffSessionToken() } : "skip"
  );
  const unreadCount = useQuery(
    api.queries.notifications.unreadCount,
    user?._id ? { userId: user._id, sessionToken: getStaffSessionToken() } : "skip"
  );
  const documents = useQuery(
    (api as any).queries.workers.listWorkerDocuments,
    user?._id && workerProfile?._id ? { userId: user._id, sessionToken: getStaffSessionToken(), workerProfileId: workerProfile._id } : "skip"
  );
  const onboardingItems = useQuery(
    (api as any).queries.workers.listWorkerOnboardingItems,
    user?._id && workerProfile?._id ? { userId: user._id, sessionToken: getStaffSessionToken(), workerProfileId: workerProfile._id } : "skip"
  );

  if (!user || jobs === undefined || payments === undefined || teams === undefined || workerProfile === undefined || unreadCount === undefined || (workerProfile?._id && (documents === undefined || onboardingItems === undefined))) {
    return <PageLoader />;
  }

  const activeJobs = jobs.filter((job) => ACTIVE_STATUSES.has(job.status));
  const todayJobs = activeJobs.filter((job) => job.scheduledDate === today);
  const upcomingJobs = activeJobs.filter((job) => job.scheduledDate > today).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  const recentJobs = jobs.filter((job) => RECENT_STATUSES.has(job.status)).sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));
  const performance = {
    activeJobs: activeJobs.length,
    jobsAwaitingReview: jobs.filter((job) => job.status === "submitted").length,
    jobsCompleted: jobs.filter((job) => job.status === "approved").length,
    jobsRequiringRework: jobs.filter((job) => job.status === "rework_requested").length,
  };
  const openPayments = payments.filter((payment: any) => payment.paymentStatus !== "PAID").length;
  const onboardingAttention = workerProfile?._id
    ? (documents ?? []).filter((document: any) => document.required !== false && document.status !== "reviewed" && document.status !== "waived").length +
      (onboardingItems ?? []).filter((item: any) => item.required !== false && item.status !== "complete" && item.status !== "waived").length
    : 0;
  const attentionCount = todayJobs.length + activeJobs.filter((job) => job.status === "in_progress" || job.status === "rework_requested").length + openPayments + onboardingAttention + unreadCount;

  const model: WorkerHomeViewModel = {
    worker: { name: user.name ?? "worker", role: user.role === "maintenance" ? "maintenance" : "cleaner" },
    attentionCount,
    todayJobs: todayJobs.map(toJobSummary),
    activeJobs: activeJobs.map(toJobSummary),
    upcomingJobs: upcomingJobs.map(toJobSummary),
    recentJobs: recentJobs.map(toJobSummary),
    notifications: { unreadCount },
    teams: (teams ?? []).map((team: any) => ({ id: String(team._id), name: team.name, description: team.description })),
    performance,
    payments: payments.map((payment: any) => ({ id: String(payment._id), jobLabel: payment.jobLabel, paymentStatus: payment.paymentStatus, plannedPayCents: payment.plannedPayCents })),
    onboarding: {
      profile: workerProfile ? { onboardingStatus: workerProfile.onboardingStatus, jobEligibilityStatus: workerProfile.jobEligibilityStatus } : null,
      documents: (documents ?? []).map((document: any) => ({ id: String(document._id), status: document.status, required: document.required })),
      items: (onboardingItems ?? []).map((item: any) => ({ id: String(item._id), title: item.title, status: item.status, required: item.required })),
    },
  };

  return <WorkerHomePresentation model={model} interactionMode="production" />;
}
