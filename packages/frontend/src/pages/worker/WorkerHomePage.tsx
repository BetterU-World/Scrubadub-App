import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "convex/react";
import {
  AlertCircle,
  Banknote,
  Bell,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock,
  FileText,
  MapPin,
  Settings,
  TrendingUp,
  Users,
} from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { StatusBadge } from "@/components/ui/StatusBadge";

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

type SectionLinkProps = {
  href: string;
  children: React.ReactNode;
};

const ACTIVE_STATUSES = new Set(["scheduled", "confirmed", "in_progress", "rework_requested"]);
const RECENT_STATUSES = new Set(["submitted", "approved"]);

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(value?: string | number | null) {
  if (!value) return "Not set";
  const date = typeof value === "number" ? new Date(value) : new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatMoney(cents?: number | null) {
  if (cents == null) return "Amount pending";
  return `$${(cents / 100).toFixed(2)}`;
}

function formatLabel(value?: string | null) {
  if (!value) return "Not set";
  return value
    .split("_")
    .map((part) => part === "1099" ? part : part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
    .replace("W2", "W-2");
}

function SectionHeader({
  icon: Icon,
  title,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <div className="flex items-center gap-2 min-w-0">
        <div className="p-2 rounded-lg bg-gray-100 text-gray-600">
          <Icon className="w-4 h-4" />
        </div>
        <h2 className="font-semibold text-gray-900 truncate">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function SectionLink({ href, children }: SectionLinkProps) {
  return (
    <Link href={href} className="text-sm font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1 flex-shrink-0">
      {children}
      <ChevronRight className="w-4 h-4" />
    </Link>
  );
}

function EmptySummary({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-500">{children}</p>;
}

function JobRow({ job }: { job: WorkerJob }) {
  return (
    <Link href={`/jobs/${job._id}`} className="block rounded-lg border border-gray-100 bg-gray-50 px-3 py-3 hover:bg-gray-100 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-gray-900 truncate">{job.propertyName ?? "Job"}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {formatDate(job.scheduledDate)}
            </span>
            {job.startTime && (
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {job.startTime}
              </span>
            )}
            {job.propertyAddress && (
              <span className="flex items-center gap-1 min-w-0">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{job.propertyAddress}</span>
              </span>
            )}
          </div>
          {job.assignedTeamName && (
            <p className="text-xs text-blue-600 mt-1">Team: {job.assignedTeamName}</p>
          )}
        </div>
        <StatusBadge status={job.status as any} />
      </div>
    </Link>
  );
}

function WelcomeSection({ user, attentionCount }: { user: any; attentionCount: number }) {
  const roleLabel = user?.role === "maintenance" ? "maintenance" : "cleaning";
  return (
    <section className="card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">Worker Home</p>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">
            Welcome back, {user?.name ?? "worker"}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Your {roleLabel} work, schedule, payments, and company updates in one place.
          </p>
        </div>
        <div className={`rounded-lg px-4 py-3 ${attentionCount > 0 ? "bg-amber-50 text-amber-800" : "bg-green-50 text-green-700"}`}>
          <p className="text-sm font-semibold">
            {attentionCount > 0 ? `${attentionCount} item${attentionCount === 1 ? "" : "s"} need attention` : "Nothing urgent right now"}
          </p>
          <p className="text-xs mt-0.5">
            {attentionCount > 0 ? "Start with today, onboarding, or notifications." : "Check upcoming work or update your availability."}
          </p>
        </div>
      </div>
    </section>
  );
}

function TodayJobsSection({ jobs }: { jobs: WorkerJob[] }) {
  return (
    <section className="card">
      <SectionHeader icon={ClipboardCheck} title="Today's Jobs" action={<SectionLink href="/jobs">View All Jobs</SectionLink>} />
      {jobs.length === 0 ? (
        <EmptySummary>No jobs scheduled for today.</EmptySummary>
      ) : (
        <div className="space-y-2">
          {jobs.slice(0, 3).map((job) => <JobRow key={job._id} job={job} />)}
        </div>
      )}
    </section>
  );
}

function ActiveJobsSection({ jobs }: { jobs: WorkerJob[] }) {
  const inProgress = jobs.filter((job) => job.status === "in_progress" || job.status === "rework_requested");
  const visible = inProgress.length > 0 ? inProgress : jobs;
  return (
    <section className="card">
      <SectionHeader icon={Clock} title="Active Work" action={<SectionLink href="/jobs">Open Jobs</SectionLink>} />
      {visible.length === 0 ? (
        <EmptySummary>No active work waiting on you.</EmptySummary>
      ) : (
        <div className="space-y-2">
          {visible.slice(0, 3).map((job) => <JobRow key={job._id} job={job} />)}
        </div>
      )}
    </section>
  );
}

function UpcomingJobsSection({ jobs }: { jobs: WorkerJob[] }) {
  return (
    <section className="card">
      <SectionHeader icon={Calendar} title="Coming Next" action={<SectionLink href="/calendar">Open Calendar</SectionLink>} />
      {jobs.length === 0 ? (
        <EmptySummary>No upcoming jobs on your schedule.</EmptySummary>
      ) : (
        <div className="space-y-2">
          {jobs.slice(0, 4).map((job) => <JobRow key={job._id} job={job} />)}
        </div>
      )}
    </section>
  );
}

function RecentJobsSection({ jobs }: { jobs: WorkerJob[] }) {
  return (
    <section className="card">
      <SectionHeader icon={CheckCircle2} title="Recent Jobs" action={<SectionLink href="/jobs">View Jobs</SectionLink>} />
      {jobs.length === 0 ? (
        <EmptySummary>No recent submitted or approved jobs yet.</EmptySummary>
      ) : (
        <div className="space-y-2">
          {jobs.slice(0, 4).map((job) => <JobRow key={job._id} job={job} />)}
        </div>
      )}
    </section>
  );
}

function TeamSection({ teams }: { teams: any[] }) {
  return (
    <section className="card">
      <SectionHeader icon={Users} title="Team" />
      {teams.length === 0 ? (
        <EmptySummary>You are not assigned to an active team right now.</EmptySummary>
      ) : (
        <div className="space-y-2">
          {teams.slice(0, 3).map((team) => (
            <div key={team._id} className="rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-sm font-medium text-gray-900">{team.name}</p>
              {team.description && <p className="text-xs text-gray-500 mt-0.5">{team.description}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PerformanceSection({ summary }: { summary: any }) {
  return (
    <section className="card">
      <SectionHeader icon={TrendingUp} title="Performance" action={<SectionLink href="/jobs">Open Performance</SectionLink>} />
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-gray-50 px-3 py-3">
          <p className="text-xs text-gray-500">Active Jobs</p>
          <p className="text-xl font-bold text-gray-900">{summary?.activeJobs ?? 0}</p>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-3">
          <p className="text-xs text-gray-500">Awaiting Review</p>
          <p className="text-xl font-bold text-gray-900">{summary?.jobsAwaitingReview ?? 0}</p>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-3">
          <p className="text-xs text-gray-500">Completed</p>
          <p className="text-xl font-bold text-gray-900">{summary?.jobsCompleted ?? 0}</p>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-3">
          <p className="text-xs text-gray-500">Needs Rework</p>
          <p className="text-xl font-bold text-gray-900">{summary?.jobsRequiringRework ?? 0}</p>
        </div>
      </div>
    </section>
  );
}

function PaymentSummarySection({ payments }: { payments: any[] }) {
  const open = payments.filter((item) => item.paymentStatus !== "PAID");
  const paid = payments.filter((item) => item.paymentStatus === "PAID");
  const nextOpen = open[0];
  return (
    <section className="card">
      <SectionHeader icon={Banknote} title="Payments" action={<SectionLink href="/payments">Open Payments</SectionLink>} />
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-amber-50 px-3 py-3">
            <p className="text-xs text-amber-700">Open</p>
            <p className="text-xl font-bold text-amber-900">{open.length}</p>
          </div>
          <div className="rounded-lg bg-green-50 px-3 py-3">
            <p className="text-xs text-green-700">Paid</p>
            <p className="text-xl font-bold text-green-900">{paid.length}</p>
          </div>
        </div>
        {nextOpen ? (
          <p className="text-sm text-gray-600">
            Next open item: <span className="font-medium text-gray-900">{nextOpen.jobLabel}</span> - {formatMoney(nextOpen.plannedPayCents)}
          </p>
        ) : (
          <EmptySummary>No open payment items.</EmptySummary>
        )}
      </div>
    </section>
  );
}

function OnboardingSection({
  profile,
  documents,
  onboardingItems,
}: {
  profile: any;
  documents: any[];
  onboardingItems: any[];
}) {
  const requiredOnboarding = onboardingItems.filter((item) => item.required !== false);
  const incompleteOnboarding = requiredOnboarding.filter((item) => item.status !== "complete" && item.status !== "waived");
  const requiredDocuments = documents.filter((document) => document.required !== false);
  const missingDocuments = requiredDocuments.filter((document) => document.status !== "reviewed" && document.status !== "waived");
  const needsAttention = incompleteOnboarding.length + missingDocuments.length;

  return (
    <section className="card">
      <SectionHeader icon={FileText} title="Onboarding & Documents" action={<SectionLink href="/settings#compliance">Open Compliance</SectionLink>} />
      {!profile ? (
        <EmptySummary>Your worker profile is not initialized yet.</EmptySummary>
      ) : (
        <div className="space-y-3">
          <div className={`rounded-lg px-3 py-3 ${needsAttention > 0 ? "bg-amber-50 text-amber-800" : "bg-green-50 text-green-700"}`}>
            <p className="text-sm font-semibold">
              {needsAttention > 0 ? `${needsAttention} item${needsAttention === 1 ? "" : "s"} need attention` : "Onboarding is in good shape"}
            </p>
            <p className="text-xs mt-0.5">
              Status: {formatLabel(profile.onboardingStatus)} - Eligibility: {formatLabel(profile.jobEligibilityStatus)}
            </p>
          </div>
          {incompleteOnboarding.slice(0, 2).map((item) => (
            <div key={item._id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-sm font-medium text-gray-900">{item.title}</p>
              <span className="badge bg-amber-100 text-amber-700">{formatLabel(item.status)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AvailabilitySection() {
  return (
    <section className="card">
      <SectionHeader icon={Clock} title="Availability" action={<SectionLink href="/availability">Edit Availability</SectionLink>} />
      <p className="text-sm text-gray-600">
        Keep your regular schedule and day overrides current so upcoming assignments match when you can work.
      </p>
    </section>
  );
}

function NotificationsSection({ unreadCount }: { unreadCount?: number }) {
  return (
    <section className="card">
      <SectionHeader icon={Bell} title="Notifications" action={<SectionLink href="/notifications">View Notifications</SectionLink>} />
      {unreadCount && unreadCount > 0 ? (
        <div className="flex items-center gap-2 rounded-lg bg-primary-50 px-3 py-3 text-primary-800">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <p className="text-sm font-medium">{unreadCount} unread notification{unreadCount === 1 ? "" : "s"}</p>
        </div>
      ) : (
        <EmptySummary>No unread notifications.</EmptySummary>
      )}
    </section>
  );
}

function QuickActionsSection() {
  const actions = [
    { href: "/jobs", label: "View jobs", icon: ClipboardCheck },
    { href: "/calendar", label: "Calendar", icon: Calendar },
    { href: "/availability", label: "Availability", icon: Clock },
    { href: "/payments", label: "Payments", icon: Banknote },
    { href: "/manuals", label: "Manuals", icon: BookOpen },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <section className="card">
      <SectionHeader icon={ChevronRight} title="Quick Actions" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {actions.map((action) => (
          <Link key={action.href} href={action.href} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <action.icon className="w-4 h-4 text-gray-400" />
            {action.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

export function WorkerHomePage() {
  const { user } = useAuth();
  const today = useMemo(() => todayString(), []);

  const jobs = useQuery(
    api.queries.jobs.getForCleaner,
    user?.companyId ? { cleanerId: user._id, companyId: user.companyId, userId: user._id } : "skip"
  ) as WorkerJob[] | undefined;
  const payments = useQuery(
    api.queries.cleanerPayments.listCleanerJobsWithPaymentStatus,
    user?._id ? { userId: user._id } : "skip"
  );
  const teams = useQuery(
    (api as any).queries.teams.listMyTeams,
    user?._id ? { userId: user._id } : "skip"
  );
  const workerProfile = useQuery(
    (api as any).queries.workers.getWorkerProfileForUser,
    user?._id ? { userId: user._id } : "skip"
  );
  const unreadCount = useQuery(
    api.queries.notifications.unreadCount,
    user?._id ? { userId: user._id } : "skip"
  );
  const documents = useQuery(
    (api as any).queries.workers.listWorkerDocuments,
    user?._id && workerProfile?._id ? { userId: user._id, workerProfileId: workerProfile._id } : "skip"
  );
  const onboardingItems = useQuery(
    (api as any).queries.workers.listWorkerOnboardingItems,
    user?._id && workerProfile?._id ? { userId: user._id, workerProfileId: workerProfile._id } : "skip"
  );

  if (
    !user ||
    jobs === undefined ||
    payments === undefined ||
    teams === undefined ||
    workerProfile === undefined ||
    unreadCount === undefined ||
    (workerProfile?._id && (documents === undefined || onboardingItems === undefined))
  ) {
    return <PageLoader />;
  }

  const activeJobs = jobs.filter((job) => ACTIVE_STATUSES.has(job.status));
  const todayJobs = activeJobs.filter((job) => job.scheduledDate === today);
  const upcomingJobs = activeJobs
    .filter((job) => job.scheduledDate > today)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  const recentJobs = jobs
    .filter((job) => RECENT_STATUSES.has(job.status))
    .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));
  const performanceSummary = {
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
  const attentionCount =
    todayJobs.length +
    activeJobs.filter((job) => job.status === "in_progress" || job.status === "rework_requested").length +
    openPayments +
    onboardingAttention +
    unreadCount;

  return (
    <div className="space-y-4">
      <WelcomeSection user={user} attentionCount={attentionCount} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <div className="space-y-4">
          <TodayJobsSection jobs={todayJobs} />
          <ActiveJobsSection jobs={activeJobs} />
          <UpcomingJobsSection jobs={upcomingJobs} />
          <RecentJobsSection jobs={recentJobs} />
        </div>

        <div className="space-y-4">
          <NotificationsSection unreadCount={unreadCount} />
          <TeamSection teams={teams ?? []} />
          <PerformanceSection summary={performanceSummary} />
          <PaymentSummarySection payments={payments ?? []} />
          <OnboardingSection
            profile={workerProfile}
            documents={documents ?? []}
            onboardingItems={onboardingItems ?? []}
          />
          <AvailabilitySection />
          <QuickActionsSection />
        </div>
      </div>
    </div>
  );
}
