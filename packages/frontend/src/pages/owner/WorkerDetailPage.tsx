import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Link, useParams } from "wouter";
import {
  Banknote,
  Briefcase,
  ClipboardCheck,
  FileText,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

function formatLabel(value?: string | null) {
  if (!value) return "Not set";
  return value
    .split("_")
    .map((part) => part === "1099" ? part : part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
    .replace("W2", "W-2");
}

function formatDate(value?: number | string | null) {
  if (!value) return "Not set";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleDateString();
}

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase text-gray-400">{label}</p>
      <div className="mt-1 text-sm font-medium text-gray-900">{value}</div>
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-gray-100 text-gray-600">
          <Icon className="w-4 h-4" />
        </div>
        <h2 className="font-semibold text-gray-900">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-500">{children}</p>;
}

export function WorkerDetailPage() {
  const { user } = useAuth();
  const params = useParams<{ id: string }>();

  const employees = useQuery(
    api.queries.employees.list,
    user?.companyId ? { companyId: user.companyId, userId: user._id } : "skip"
  );
  const workerProfile = useQuery(
    (api as any).queries.workers.getWorkerProfileForUser,
    user && params.id ? { userId: user._id, workerUserId: params.id as Id<"users"> } : "skip"
  );
  const documents = useQuery(
    (api as any).queries.workers.listWorkerDocuments,
    user && workerProfile?._id ? { userId: user._id, workerProfileId: workerProfile._id } : "skip"
  );
  const onboardingItems = useQuery(
    (api as any).queries.workers.listWorkerOnboardingItems,
    user && workerProfile?._id ? { userId: user._id, workerProfileId: workerProfile._id } : "skip"
  );
  const jobs = useQuery(
    api.queries.jobs.list,
    user?.companyId ? { companyId: user.companyId, userId: user._id } : "skip"
  );
  const teams = useQuery(
    (api as any).queries.teams.list,
    user?.companyId ? { companyId: user.companyId, userId: user._id, includeArchived: true } : "skip"
  );

  if (
    !user ||
    employees === undefined ||
    workerProfile === undefined ||
    jobs === undefined ||
    teams === undefined ||
    (workerProfile?._id && (documents === undefined || onboardingItems === undefined))
  ) return <PageLoader />;

  const workerUser = (employees ?? []).find((employee) => String(employee._id) === params.id);

  if (!workerUser) {
    return (
      <div>
        <PageHeader title="Worker not found" />
        <div className="card">
          <EmptyNote>This worker is not available in your company roster.</EmptyNote>
          <Link href="/employees" className="btn-secondary inline-block mt-4">Back to Workers</Link>
        </div>
      </div>
    );
  }

  const activeTeams = (teams ?? [])
    .flatMap((team: any) =>
      (team.members ?? [])
        .filter((membership: any) => membership.active && String(membership.userId) === params.id)
        .map((membership: any) => ({ ...membership, team }))
    );
  const teamIds = new Set(activeTeams.map((membership: any) => membership.teamId));
  const recentJobs = (jobs ?? [])
    .filter((job: any) =>
      job.cleanerIds?.some((id: Id<"users">) => String(id) === params.id) ||
      String(job.assignedManagerId) === params.id ||
      (job.assignedTeamId && teamIds.has(job.assignedTeamId))
    );
  recentJobs.sort((a: any, b: any) => (b.scheduledDate ?? "").localeCompare(a.scheduledDate ?? ""));
  const payProfile = workerProfile?.payProfile ?? {};

  return (
    <div>
      <PageHeader
        title={workerUser?.name ?? "Worker"}
        description={workerUser?.email ?? "Worker profile"}
        action={<Link href="/employees" className="btn-secondary">Back to Workers</Link>}
      />

      <div className="card mb-6">
        <div className="grid gap-4 md:grid-cols-4">
          <DetailItem label="Email" value={workerUser?.email ?? "Not set"} />
          <DetailItem label="Phone" value={workerUser?.phone ?? "Not set"} />
          <DetailItem label="Worker Type" value={formatLabel(workerProfile?.workerType)} />
          <DetailItem label="Operational Role" value={formatLabel(workerProfile?.primaryRole ?? workerUser?.role)} />
          <DetailItem label="Worker Status" value={<StatusBadge status={workerProfile?.workerStatus ?? workerUser.status} />} />
          <DetailItem label="Start Date" value={formatDate(workerProfile?.createdAt ?? workerUser?._creationTime)} />
          <DetailItem label="Onboarding" value={formatLabel(workerProfile?.onboardingStatus)} />
          <DetailItem label="Eligibility" value={formatLabel(workerProfile?.jobEligibilityStatus)} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard icon={ClipboardCheck} title="Onboarding">
          {(onboardingItems ?? []).length === 0 ? (
            <EmptyNote>No onboarding items have been added yet.</EmptyNote>
          ) : (
            <div className="space-y-2">
              {onboardingItems.map((item: any) => (
                <div key={item._id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.title}</p>
                    {item.notes && <p className="text-xs text-gray-500">{item.notes}</p>}
                  </div>
                  <span className="badge bg-gray-100 text-gray-700">{formatLabel(item.status)}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard icon={FileText} title="Documents">
          {(documents ?? []).length === 0 ? (
            <EmptyNote>No document metadata has been recorded yet. Sensitive tax and identity documents stay off-platform.</EmptyNote>
          ) : (
            <div className="space-y-2">
              {documents.map((document: any) => (
                <div key={document._id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{formatLabel(document.documentType)}</p>
                    <p className="text-xs text-gray-500">
                      {document.handledOffPlatform ? "Handled off-platform" : "Metadata only"}
                    </p>
                  </div>
                  <span className="badge bg-gray-100 text-gray-700">{formatLabel(document.status)}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard icon={ShieldCheck} title="Eligibility">
          <div className="space-y-3">
            <DetailItem label="Job Eligibility" value={formatLabel(workerProfile?.jobEligibilityStatus)} />
            <DetailItem
              label="Eligible Roles"
              value={(workerProfile?.eligibleRoles ?? []).length > 0
                ? workerProfile.eligibleRoles.map(formatLabel).join(", ")
                : "Not set"}
            />
            <DetailItem label="Compliance Notes" value={workerProfile?.manualComplianceNotes ?? "No notes yet"} />
          </div>
        </SectionCard>

        <SectionCard icon={Banknote} title="Payment Profile">
          <div className="space-y-3">
            <DetailItem label="Pay Type" value={formatLabel(payProfile.payType)} />
            <DetailItem
              label="Default Rate"
              value={payProfile.defaultRateCents != null ? `$${(payProfile.defaultRateCents / 100).toFixed(2)}` : "Not set"}
            />
            <DetailItem label="Currency" value={(payProfile.currency ?? "usd").toUpperCase()} />
            <DetailItem
              label="Stripe Connect"
              value={payProfile.stripeConnectEnabled ? "Enabled metadata" : "Not enabled in worker profile"}
            />
          </div>
        </SectionCard>

        <SectionCard icon={Users} title="Teams">
          {activeTeams.length === 0 ? (
            <EmptyNote>This worker is not an active member of any team.</EmptyNote>
          ) : (
            <div className="space-y-2">
              {activeTeams.map((membership: any) => (
                <div key={membership._id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-sm font-medium text-gray-900">{membership.team?.name ?? "Unknown team"}</p>
                  <span className="badge bg-gray-100 text-gray-700">{formatLabel(membership.role)}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard icon={Briefcase} title="Recent Activity">
          {recentJobs.length === 0 ? (
            <EmptyNote>No recent worker activity is available yet.</EmptyNote>
          ) : (
            <div className="space-y-2">
              {recentJobs.slice(0, 5).map((job: any) => (
                <Link
                  key={job._id}
                  href={`/jobs/${job._id}`}
                  className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 hover:bg-gray-100"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{job.propertyName ?? "Job"}</p>
                    <p className="text-xs text-gray-500">{job.scheduledDate}</p>
                  </div>
                  <span className="badge bg-gray-100 text-gray-700">{formatLabel(job.status)}</span>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
