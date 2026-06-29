import { useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { Link } from "wouter";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import {
  AlertCircle,
  Banknote,
  CalendarClock,
  CheckCircle,
  ChevronRight,
  FileText,
  Link2,
  LogOut,
  User,
  Wrench,
} from "lucide-react";

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

function formatMoney(cents?: number | null) {
  if (cents == null) return "Amount pending";
  return `$${(cents / 100).toFixed(2)}`;
}

function SectionCard({
  id,
  icon: Icon,
  title,
  action,
  children,
}: {
  id?: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="card scroll-mt-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-2 rounded-lg bg-gray-100 text-gray-600">
            <Icon className="w-4 h-4" />
          </div>
          <h2 className="font-semibold text-gray-900 truncate">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function SectionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700">
      {children}
      <ChevronRight className="w-4 h-4" />
    </Link>
  );
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase text-gray-400">{label}</p>
      <div className="mt-1 text-sm font-medium text-gray-900">{value}</div>
    </div>
  );
}

function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="text-sm text-gray-500">{children}</p>;
}

function ProfileBasicsSection({ user, workerProfile }: { user: any; workerProfile: any }) {
  return (
    <SectionCard id="profile" icon={User} title="Profile Basics">
      <div className="grid gap-4 sm:grid-cols-2">
        <DetailItem label="Name" value={user.name} />
        <DetailItem label="Email" value={user.email} />
        <DetailItem label="Phone" value={user.phone || "Not set"} />
        <DetailItem label="Role" value={formatLabel(workerProfile?.primaryRole ?? user.role)} />
        <DetailItem label="Company" value={user.companyName || "Not set"} />
        <DetailItem label="Worker Status" value={formatLabel(workerProfile?.workerStatus ?? user.status)} />
      </div>
    </SectionCard>
  );
}

function WorkPreferencesSection({ user, workerProfile }: { user: any; workerProfile: any }) {
  return (
    <SectionCard
      id="work-preferences"
      icon={CalendarClock}
      title="Work Preferences"
      action={<SectionLink href="/availability">Edit Availability</SectionLink>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <DetailItem label="Worker Type" value={formatLabel(workerProfile?.workerType)} />
        <DetailItem label="Primary Role" value={formatLabel(workerProfile?.primaryRole ?? user.role)} />
        <DetailItem
          label="Eligible Roles"
          value={(workerProfile?.eligibleRoles ?? []).length > 0
            ? workerProfile.eligibleRoles.map(formatLabel).join(", ")
            : formatLabel(user.role)}
        />
        <DetailItem label="Job Eligibility" value={formatLabel(workerProfile?.jobEligibilityStatus)} />
      </div>
      <p className="mt-4 text-sm text-gray-500">
        Availability changes are managed on the dedicated availability page so scheduling stays consistent.
      </p>
    </SectionCard>
  );
}

function DocumentsSection({ documents, hasProfile }: { documents: any[]; hasProfile: boolean }) {
  const required = documents.filter((document) => document.required !== false);
  const ready = required.filter((document) => document.status === "reviewed" || document.status === "waived");
  const needsAttention = required.filter((document) => document.status !== "reviewed" && document.status !== "waived");

  return (
    <SectionCard id="documents" icon={FileText} title="Documents">
      {!hasProfile ? (
        <EmptyNote>Your worker profile has not been initialized yet.</EmptyNote>
      ) : documents.length === 0 ? (
        <EmptyNote>No document records have been added yet. Sensitive tax and identity documents may be handled off-platform.</EmptyNote>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg bg-gray-50 px-3 py-3">
            <p className="text-sm font-semibold text-gray-900">
              {ready.length}/{required.length} required documents reviewed or waived
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {needsAttention.length > 0 ? `${needsAttention.length} document${needsAttention.length === 1 ? "" : "s"} still need attention.` : "Required document records are up to date."}
            </p>
          </div>
          {documents.slice(0, 4).map((document) => (
            <div key={document._id} className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-gray-900">{formatLabel(document.documentType)}</p>
                <p className="text-xs text-gray-500">
                  {document.required ? "Required" : "Optional"}
                  {document.reviewedAt ? ` · Reviewed ${formatDate(document.reviewedAt)}` : ""}
                </p>
              </div>
              <span className="badge bg-gray-100 text-gray-700">{formatLabel(document.status)}</span>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function OnboardingSection({
  workerProfile,
  onboardingItems,
}: {
  workerProfile: any;
  onboardingItems: any[];
}) {
  const required = onboardingItems.filter((item) => item.required !== false);
  const complete = required.filter((item) => item.status === "complete" || item.status === "waived");
  const incomplete = required.filter((item) => item.status !== "complete" && item.status !== "waived");

  return (
    <SectionCard id="onboarding" icon={CheckCircle} title="Onboarding" action={<SectionLink href="/">Back to Home</SectionLink>}>
      {!workerProfile ? (
        <EmptyNote>Your worker profile has not been initialized yet.</EmptyNote>
      ) : onboardingItems.length === 0 ? (
        <EmptyNote>No onboarding checklist items have been added yet.</EmptyNote>
      ) : (
        <div className="space-y-3">
          <div className={`rounded-lg px-3 py-3 ${incomplete.length > 0 ? "bg-amber-50 text-amber-800" : "bg-green-50 text-green-700"}`}>
            <p className="text-sm font-semibold">
              {complete.length}/{required.length} required items complete
            </p>
            <p className="text-xs mt-0.5">Overall status: {formatLabel(workerProfile.onboardingStatus)}</p>
          </div>
          {incomplete.slice(0, 4).map((item) => (
            <div key={item._id} className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-gray-900">{item.title}</p>
                <p className="text-xs text-gray-500">{item.required ? "Required" : "Optional"}</p>
              </div>
              <span className="badge bg-amber-100 text-amber-700">{formatLabel(item.status)}</span>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function PaymentsSection({
  connectStatus,
  payments,
  loading,
  error,
  accountIdSuffix,
  isConnected,
  onConnect,
}: {
  connectStatus: any;
  payments: any[];
  loading: boolean;
  error: string | null;
  accountIdSuffix: string | null;
  isConnected: boolean;
  onConnect: () => void;
}) {
  const openPayments = payments.filter((payment) => payment.paymentStatus !== "PAID");
  const paidPayments = payments.filter((payment) => payment.paymentStatus === "PAID");
  const nextOpenPayment = openPayments[0];

  return (
    <SectionCard id="payments" icon={Banknote} title="Payments" action={<SectionLink href="/payments">Open Payments</SectionLink>}>
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-gray-50 px-3 py-3">
          <p className="text-xs text-gray-500">Open Payment Items</p>
          <p className="text-xl font-bold text-gray-900">{openPayments.length}</p>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-3">
          <p className="text-xs text-gray-500">Paid Items</p>
          <p className="text-xl font-bold text-gray-900">{paidPayments.length}</p>
        </div>
      </div>

      {nextOpenPayment && (
        <p className="mt-3 text-sm text-gray-600">
          Next open item: <span className="font-medium text-gray-900">{nextOpenPayment.jobLabel}</span> · {formatMoney(nextOpenPayment.plannedPayCents)}
        </p>
      )}

      <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
        {isConnected ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 text-green-600">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Stripe Connected</p>
                <p className="text-sm text-gray-500">Account ...{accountIdSuffix}</p>
              </div>
            </div>
            <button
              onClick={onConnect}
              disabled={loading}
              className="btn-secondary flex items-center justify-center gap-2"
            >
              <Link2 className="w-4 h-4" />
              {loading ? "Redirecting..." : "Update Stripe Info"}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gray-100 text-gray-500">
                <Link2 className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Connect Stripe</p>
                <p className="text-sm text-gray-500">
                  Set up your account so your employer can pay you through SCRUB.
                </p>
              </div>
            </div>
            <button
              onClick={onConnect}
              disabled={loading}
              className="btn-primary flex items-center justify-center gap-2"
            >
              <Link2 className="w-4 h-4" />
              {loading ? "Redirecting..." : "Connect Stripe"}
            </button>
          </div>
        )}
      </div>

      {connectStatus?.stripeConnectPayoutsEnabled === false && isConnected && (
        <p className="mt-3 text-sm text-amber-700">
          Stripe is connected, but payouts may still need attention in Stripe.
        </p>
      )}
    </SectionCard>
  );
}

function AccountSection({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <SectionCard id="account" icon={Wrench} title="Account">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Notifications</p>
            <p className="text-xs text-gray-500">View your current app notifications.</p>
          </div>
          <SectionLink href="/notifications">View Notifications</SectionLink>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Password</p>
            <p className="text-xs text-gray-500">
              Password resets are available from the sign-in screen for {email}.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="btn-secondary flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </SectionCard>
  );
}

export function CleanerSettingsPage() {
  const { user, signOut } = useAuth();
  const connectStatus = useQuery(
    api.queries.cleanerStripeConnect.getCleanerConnectStatus,
    user?._id ? { userId: user._id } : "skip"
  );
  const workerProfile = useQuery(
    (api as any).queries.workers.getWorkerProfileForUser,
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
  const payments = useQuery(
    api.queries.cleanerPayments.listCleanerJobsWithPaymentStatus,
    user?._id ? { userId: user._id } : "skip"
  );
  const createAccountLink = useAction(
    api.actions.cleanerStripeConnect.createCleanerStripeAccountLink
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const params = new URLSearchParams(window.location.search);
  const stripeParam = params.get("stripe");

  if (
    !user ||
    connectStatus === undefined ||
    workerProfile === undefined ||
    payments === undefined ||
    (workerProfile?._id && (documents === undefined || onboardingItems === undefined))
  ) {
    return <PageLoader />;
  }

  const isConnected = !!connectStatus?.stripeConnectAccountId;
  const accountIdSuffix = connectStatus?.stripeConnectAccountId
    ? connectStatus.stripeConnectAccountId.slice(-6)
    : null;

  const handleConnect = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await createAccountLink({ userId: user._id });
      if (result?.url) {
        window.location.href = result.url;
      }
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Worker Settings"
        description="Your profile, work preferences, onboarding, documents, payments, and account links."
      />

      {stripeParam === "return" && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          Stripe onboarding complete. You can receive payments for jobs.
        </div>
      )}
      {stripeParam === "refresh" && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-yellow-50 p-3 text-sm text-yellow-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          Stripe session expired. Start the connection again when you are ready.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ProfileBasicsSection user={user} workerProfile={workerProfile} />
        <WorkPreferencesSection user={user} workerProfile={workerProfile} />
        <DocumentsSection documents={documents ?? []} hasProfile={!!workerProfile?._id} />
        <OnboardingSection workerProfile={workerProfile} onboardingItems={onboardingItems ?? []} />
        <PaymentsSection
          connectStatus={connectStatus}
          payments={payments ?? []}
          loading={loading}
          error={error}
          accountIdSuffix={accountIdSuffix}
          isConnected={isConnected}
          onConnect={handleConnect}
        />
        <AccountSection email={user.email} onSignOut={signOut} />
      </div>
    </div>
  );
}
