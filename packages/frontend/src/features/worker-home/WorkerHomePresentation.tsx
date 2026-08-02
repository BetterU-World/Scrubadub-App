import type { ComponentType, ReactNode } from "react";
import { Link } from "wouter";
import {
  AlertCircle, Banknote, Bell, BookOpen, Calendar, CheckCircle2, ChevronRight,
  ClipboardCheck, Clock, FileText, MapPin, Settings, TrendingUp, Users,
} from "lucide-react";
import { StatusBadge } from "../../components/ui/StatusBadge";
import type {
  WorkerHomeInteractionMode,
  WorkerHomeViewModel,
  WorkerJobSummary,
} from "./workerHomeViewModel";

function formatDate(value?: string | number | null) {
  if (!value) return "Not set";
  const date = typeof value === "number" ? new Date(value) : new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatMoney(cents?: number | null) {
  return cents == null ? "Amount pending" : `$${(cents / 100).toFixed(2)}`;
}

function formatLabel(value?: string | null) {
  if (!value) return "Not set";
  return value.split("_").map((part) => part === "1099" ? part : part.charAt(0).toUpperCase() + part.slice(1)).join(" ").replace("W2", "W-2");
}

function SectionHeader({ icon: Icon, title, action }: { icon: ComponentType<{ className?: string }>; title: string; action?: ReactNode }) {
  return <div className="mb-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
    <div className="flex min-w-0 items-center gap-2"><div className="rounded-lg bg-gray-100 p-2 text-gray-600"><Icon className="h-4 w-4" /></div><h2 className="break-words font-semibold text-gray-900">{title}</h2></div>{action}
  </div>;
}

function PresentationLink({ href, mode, children, className }: { href: string; mode: WorkerHomeInteractionMode; children: ReactNode; className: string }) {
  if (mode === "production") return <Link href={href} className={className}>{children}</Link>;
  return <div className={className}>{children}</div>;
}

function SectionLink({ href, mode, children }: { href: string; mode: WorkerHomeInteractionMode; children: ReactNode }) {
  return <PresentationLink href={href} mode={mode} className="touch-target -ml-3 inline-flex items-center gap-1 px-3 text-sm font-medium text-primary-600 sm:ml-0">{children}<ChevronRight className="h-4 w-4" /></PresentationLink>;
}

function EmptySummary({ children }: { children: ReactNode }) { return <p className="text-sm text-gray-500">{children}</p>; }

function JobRow({ job, mode }: { job: WorkerJobSummary; mode: WorkerHomeInteractionMode }) {
  return <PresentationLink href={`/jobs/${job.id}`} mode={mode} className="touch-target block rounded-lg border border-gray-100 bg-gray-50 px-3 py-3 transition-colors">
    <div className="flex flex-col items-start gap-2 sm:flex-row sm:justify-between sm:gap-3"><div className="min-w-0 w-full"><p className="break-words font-medium text-gray-900">{job.propertyName ?? "Job"}</p><div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500"><span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{formatDate(job.scheduledDate)}</span>{job.startTime && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{job.startTime}</span>}{job.propertyAddress && <span className="flex min-w-0 items-start gap-1"><MapPin className="h-3.5 w-3.5 flex-shrink-0" /><span className="break-words">{job.propertyAddress}</span></span>}</div>{job.assignedTeamName && <p className="mt-1 text-xs text-blue-600">Team: {job.assignedTeamName}</p>}</div><div className="flex-shrink-0"><StatusBadge status={job.status as any} /></div></div>
  </PresentationLink>;
}

function JobsSection({ title, icon, jobs, empty, href, action, mode, limit = 3 }: { title: string; icon: ComponentType<{ className?: string }>; jobs: WorkerJobSummary[]; empty: string; href: string; action: string; mode: WorkerHomeInteractionMode; limit?: number }) {
  return <section className="card"><SectionHeader icon={icon} title={title} action={<SectionLink href={href} mode={mode}>{action}</SectionLink>} />{jobs.length === 0 ? <EmptySummary>{empty}</EmptySummary> : <div className="space-y-2">{jobs.slice(0, limit).map((job) => <JobRow key={job.id} job={job} mode={mode} />)}</div>}</section>;
}

export function WorkerHomePresentation({ model, interactionMode = "production", afterWelcome }: { model: WorkerHomeViewModel; interactionMode?: WorkerHomeInteractionMode; afterWelcome?: ReactNode }) {
  const activeVisible = model.activeJobs.filter((job) => job.status === "in_progress" || job.status === "rework_requested");
  const visibleActive = activeVisible.length ? activeVisible : model.activeJobs;
  const openPayments = model.payments.filter((item) => item.paymentStatus !== "PAID");
  const paidPayments = model.payments.filter((item) => item.paymentStatus === "PAID");
  const requiredItems = model.onboarding.items.filter((item) => item.required !== false);
  const incompleteItems = requiredItems.filter((item) => item.status !== "complete" && item.status !== "waived");
  const missingDocuments = model.onboarding.documents.filter((item) => item.required !== false && item.status !== "reviewed" && item.status !== "waived");
  const onboardingAttention = incompleteItems.length + missingDocuments.length;
  const actions = [{ href: "/jobs", label: "View jobs", icon: ClipboardCheck }, { href: "/calendar", label: "Calendar", icon: Calendar }, { href: "/availability", label: "Availability", icon: Clock }, { href: "/payments", label: "Payments", icon: Banknote }, { href: "/manuals", label: "Manuals", icon: BookOpen }, { href: "/settings", label: "Settings", icon: Settings }];

  return <div className="space-y-4">
    <section className="card"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium text-gray-500">Worker Home</p><h1 className="mt-1 text-2xl font-bold text-gray-900">Welcome back, {model.worker.name}</h1><p className="mt-1 text-sm text-gray-500">Your {model.worker.role === "maintenance" ? "maintenance" : "cleaning"} work, schedule, payments, and company updates in one place.</p></div><div className={`rounded-lg px-4 py-3 ${model.attentionCount > 0 ? "bg-amber-50 text-amber-800" : "bg-green-50 text-green-700"}`}><p className="text-sm font-semibold">{model.attentionCount > 0 ? `${model.attentionCount} item${model.attentionCount === 1 ? "" : "s"} need attention` : "Nothing urgent right now"}</p><p className="mt-0.5 text-xs">{model.attentionCount > 0 ? "Start with today, onboarding, or notifications." : "Check upcoming work or update your availability."}</p></div></div></section>
    {afterWelcome}
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]"><div className="space-y-4">
      <JobsSection title="Today's Jobs" icon={ClipboardCheck} jobs={model.todayJobs} empty="No jobs scheduled for today." href="/jobs" action="View All Jobs" mode={interactionMode} />
      <JobsSection title="Active Work" icon={Clock} jobs={visibleActive} empty="No active work waiting on you." href="/jobs" action="Open Jobs" mode={interactionMode} />
      <JobsSection title="Coming Next" icon={Calendar} jobs={model.upcomingJobs} empty="No upcoming jobs on your schedule." href="/calendar" action="Open Calendar" mode={interactionMode} limit={4} />
      <JobsSection title="Recent Jobs" icon={CheckCircle2} jobs={model.recentJobs} empty="No recent submitted or approved jobs yet." href="/jobs" action="View Jobs" mode={interactionMode} limit={4} />
    </div><div className="space-y-4">
      <section className="card"><SectionHeader icon={Bell} title="Notifications" action={<SectionLink href="/notifications" mode={interactionMode}>View Notifications</SectionLink>} />{model.notifications.unreadCount > 0 ? <div className="flex items-center gap-2 rounded-lg bg-primary-50 px-3 py-3 text-primary-800"><AlertCircle className="h-4 w-4 flex-shrink-0" /><p className="text-sm font-medium">{model.notifications.unreadCount} unread notification{model.notifications.unreadCount === 1 ? "" : "s"}</p></div> : <EmptySummary>No unread notifications.</EmptySummary>}</section>
      <section className="card"><SectionHeader icon={Users} title="Team" />{model.teams.length === 0 ? <EmptySummary>You are not assigned to an active team right now.</EmptySummary> : <div className="space-y-2">{model.teams.slice(0, 3).map((team) => <div key={team.id} className="rounded-lg bg-gray-50 px-3 py-2"><p className="text-sm font-medium text-gray-900">{team.name}</p>{team.description && <p className="mt-0.5 text-xs text-gray-500">{team.description}</p>}</div>)}</div>}</section>
      <section className="card"><SectionHeader icon={TrendingUp} title="Performance" action={<SectionLink href="/jobs" mode={interactionMode}>Open Performance</SectionLink>} /><div className="grid grid-cols-2 gap-3">{[["Active Jobs", model.performance.activeJobs], ["Awaiting Review", model.performance.jobsAwaitingReview], ["Completed", model.performance.jobsCompleted], ["Needs Rework", model.performance.jobsRequiringRework]].map(([label, value]) => <div key={String(label)} className="rounded-lg bg-gray-50 px-3 py-3"><p className="text-xs text-gray-500">{label}</p><p className="text-xl font-bold text-gray-900">{value}</p></div>)}</div></section>
      <section className="card"><SectionHeader icon={Banknote} title="Payments" action={<SectionLink href="/payments" mode={interactionMode}>Open Payments</SectionLink>} /><div className="space-y-3"><div className="grid grid-cols-2 gap-3"><div className="rounded-lg bg-amber-50 px-3 py-3"><p className="text-xs text-amber-700">Open</p><p className="text-xl font-bold text-amber-900">{openPayments.length}</p></div><div className="rounded-lg bg-green-50 px-3 py-3"><p className="text-xs text-green-700">Paid</p><p className="text-xl font-bold text-green-900">{paidPayments.length}</p></div></div>{openPayments[0] ? <p className="text-sm text-gray-600">Next open item: <span className="font-medium text-gray-900">{openPayments[0].jobLabel}</span> - {formatMoney(openPayments[0].plannedPayCents)}</p> : <EmptySummary>No open payment items.</EmptySummary>}</div></section>
      <section className="card"><SectionHeader icon={FileText} title="Onboarding & Documents" action={<SectionLink href="/settings#compliance" mode={interactionMode}>Open Compliance</SectionLink>} />{!model.onboarding.profile ? <EmptySummary>Your worker profile is not initialized yet.</EmptySummary> : <div className="space-y-3"><div className={`rounded-lg px-3 py-3 ${onboardingAttention > 0 ? "bg-amber-50 text-amber-800" : "bg-green-50 text-green-700"}`}><p className="text-sm font-semibold">{onboardingAttention > 0 ? `${onboardingAttention} item${onboardingAttention === 1 ? "" : "s"} need attention` : "Onboarding is in good shape"}</p><p className="mt-0.5 text-xs">Status: {formatLabel(model.onboarding.profile.onboardingStatus)} - Eligibility: {formatLabel(model.onboarding.profile.jobEligibilityStatus)}</p></div>{incompleteItems.slice(0, 2).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2"><p className="text-sm font-medium text-gray-900">{item.title}</p><span className="badge bg-amber-100 text-amber-700">{formatLabel(item.status)}</span></div>)}</div>}</section>
      <section className="card"><SectionHeader icon={Clock} title="Availability" action={<SectionLink href="/availability" mode={interactionMode}>Edit Availability</SectionLink>} /><p className="text-sm text-gray-600">Keep your regular schedule and day overrides current so upcoming assignments match when you can work.</p></section>
      <section className="card"><SectionHeader icon={ChevronRight} title="Quick Actions" /><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{actions.map((action) => <PresentationLink key={action.href} href={action.href} mode={interactionMode} className="touch-target flex items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700"><action.icon className="h-4 w-4 text-gray-400" />{action.label}</PresentationLink>)}</div></section>
    </div></div>
  </div>;
}
