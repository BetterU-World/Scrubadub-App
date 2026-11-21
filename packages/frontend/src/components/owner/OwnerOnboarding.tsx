import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { useHistoryState } from "wouter/use-browser-location";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { getStaffSessionSnapshot } from "@/lib/staffSession";

type OnboardingSession = { companyId: Id<"companies">; sessionToken: string };
type PreferenceChange = FunctionArgs<typeof api.ownerOnboarding.updatePreferences>["change"];
type Goal = Extract<PreferenceChange, { kind: "setGoal" }>["goal"];
type Progress = FunctionReturnType<typeof api.ownerOnboarding.progress>;

const goals = {
  schedule: { href: "/jobs/quick", label: "learningCenter.schedule" },
  invite: { href: "/employees?invite=true", label: "learningCenter.invite" },
  property: { href: "/properties/new", label: "learningCenter.property" },
} satisfies Record<Goal, { href: string; label: string }>;

const goalIds = Object.keys(goals) as Goal[];
const actionLink = "inline-flex min-h-11 items-center text-sm font-medium text-primary-700 underline underline-offset-4";

function useOwnerPreferences(enabled = true) {
  const { user, sessionToken } = useAuth();
  const session = enabled && user?.role === "owner" && user.companyId && sessionToken
    ? { companyId: user.companyId, sessionToken }
    : undefined;
  const preferences = useQuery(api.ownerOnboarding.preferences, session ?? "skip");
  return { session, preferences };
}

export function OwnerFirstWinNextAction({ goal, ownerId }: { goal: "schedule" | "property"; ownerId: Id<"users"> }) {
  const { t } = useTranslation();
  const state = useHistoryState<{ ownerFirstWin?: Goal; ownerId?: Id<"users"> } | null>();
  const { preferences } = useOwnerPreferences(state?.ownerFirstWin === goal && state.ownerId === ownerId);
  if (preferences?.goal !== goal) return null;

  return (
    <div className="card mb-4 flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-medium">{t(goal === "schedule"
        ? "ownerOnboarding.cleaningScheduled" : "ownerOnboarding.propertyReady")}</p>
      <Link href={goal === "schedule" ? "/calendar" : goals.schedule.href} className={actionLink}>
        {t(goal === "schedule" ? "learningCenter.calendar" : "learningCenter.schedule")}
      </Link>
    </div>
  );
}

function usePreferenceActions(session: OnboardingSession | undefined) {
  const update = useMutation(api.ownerOnboarding.updatePreferences);
  const [, navigate] = useLocation();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function save(change: PreferenceChange, href?: string) {
    if (!session || pending) return;
    const revision = getStaffSessionSnapshot().revision;
    setPending(true);
    setFailed(false);
    try {
      await update({ ...session, change });
      if (href && revision === getStaffSessionSnapshot().revision) navigate(href);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return { save, pending, failed };
}

function GoalChoices({ selected, disabled, choose }: {
  selected?: Goal;
  disabled: boolean;
  choose: (goal: Goal) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {goalIds.map((goal) => (
        <button key={goal} type="button" disabled={disabled} aria-pressed={selected === undefined ? undefined : selected === goal}
          className={`${goal === (selected ?? "schedule") ? "btn-primary" : "btn-secondary"} touch-target`}
          onClick={() => choose(goal)}>
          {t(goals[goal].label)}
        </button>
      ))}
    </div>
  );
}

export function OwnerOnboardingEntry() {
  const { t } = useTranslation();
  const { session, preferences } = useOwnerPreferences();
  const { pending, failed, save } = usePreferenceActions(session);

  if (!preferences) return null;
  const welcome = preferences.cohort === "signup" && !preferences.welcomeHandled;
  const announcement = preferences.cohort === "existing" && !preferences.announcementDismissed;
  if (!welcome && !announcement) return null;

  return (
    <section className="card mb-6 space-y-3" aria-labelledby="owner-onboarding-entry">
      <h2 id="owner-onboarding-entry" className="text-lg font-semibold">
        {t(welcome ? "ownerOnboarding.welcome" : "ownerOnboarding.announcement")}
      </h2>
      {welcome ? (
        <>
          <p>{t("ownerOnboarding.welcomeDescription")}</p>
          <p className="text-sm text-gray-600">{t("ownerOnboarding.returnPath")}</p>
          <GoalChoices disabled={pending} choose={(goal) => void save({ kind: "setGoal", goal }, goals[goal].href)} />
          <button type="button" className={actionLink} disabled={pending}
            onClick={() => void save({ kind: "skipWelcome" })}>{t("ownerOnboarding.skip")}</button>
        </>
      ) : (
        <>
          <p>{t("ownerOnboarding.announcementDescription")}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/manuals" className="btn-primary touch-target"
              onClick={() => void save({ kind: "dismissAnnouncement" })}>{t("learningCenter.title")}</Link>
            <button type="button" className={actionLink} disabled={pending}
              onClick={() => void save({ kind: "dismissAnnouncement" })}>{t("ownerOnboarding.dismiss")}</button>
          </div>
        </>
      )}
      {failed && <p role="alert" className="text-sm text-red-700">{t("ownerOnboarding.saveError")}</p>}
    </section>
  );
}

function useInvitationExpiry(expiresAt?: number) {
  const [, refresh] = useState(0);
  useEffect(() => {
    const delay = expiresAt === undefined ? 0 : expiresAt - Date.now();
    if (delay <= 0) return;
    const timer = window.setTimeout(() => refresh((current) => current + 1), delay);
    return () => window.clearTimeout(timer);
  }, [expiresAt]);
  return expiresAt !== undefined && expiresAt <= Date.now();
}

function GoalProgress({ goal, progress }: { goal: Goal; progress: Progress }) {
  const { t } = useTranslation();
  const expired = useInvitationExpiry(progress.invitation?.expiresAt);
  let result: { status: string; href: string; action: string } | undefined;

  if (goal === "schedule" && progress.jobId) {
    result = { status: "ownerOnboarding.cleaningScheduled", href: `/jobs/${progress.jobId}`, action: "ownerOnboarding.viewJob" };
  }
  if (goal === "property" && progress.propertyId) {
    result = { status: "ownerOnboarding.propertyReady", href: "/jobs/quick", action: "learningCenter.schedule" };
  }
  if (goal === "invite") {
    if (progress.cleaner) {
      result = {
        status: progress.cleaner === "joined" ? "ownerOnboarding.cleanerJoined" : "ownerOnboarding.cleanerActive",
        href: "/jobs/quick",
        action: "learningCenter.schedule",
      };
    } else if (progress.invitation) {
      const status = expired
        ? "ownerOnboarding.invitationExpired"
        : progress.invitation.emailSent
          ? "ownerOnboarding.invitationEmailed"
          : "ownerOnboarding.invitationCreated";
      result = { status, href: "/employees", action: "ownerOnboarding.viewTeam" };
    }
  }

  return (
    <div className="mt-3 space-y-2" aria-live="polite">
      {result && <p className="text-sm text-gray-700">{t(result.status)}</p>}
      <Link href={result?.href ?? goals[goal].href} className="btn-primary touch-target inline-flex items-center">
        {t(result?.action ?? "ownerOnboarding.resume")}
      </Link>
    </div>
  );
}

export function OwnerGettingStarted({ surface }: { surface: "dashboard" | "learningCenter" }) {
  const { t } = useTranslation();
  const { session, preferences } = useOwnerPreferences();
  const dashboard = surface === "dashboard";
  const visible = preferences && (!dashboard || (!preferences.dashboardDismissed &&
    (preferences.cohort === "existing" || preferences.welcomeHandled)));
  const goal = preferences?.goal;
  const progress = useQuery(api.ownerOnboarding.progress, visible && goal && session ? session : "skip");
  const { pending, failed, save } = usePreferenceActions(session);
  if (!visible) return null;

  return (
    <section id={dashboard ? "dashboard-getting-started" : "getting-started"}
      className={`card min-w-0 scroll-mt-4 ${dashboard ? "mb-6" : "sm:col-span-2"}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <h2 className="text-lg font-semibold">{t("learningCenter.gettingStarted")}</h2>
        {dashboard && (
          <button type="button" className={actionLink} disabled={pending}
            onClick={() => void save({ kind: "dismissDashboard" })}>{t("ownerOnboarding.hideDashboard")}</button>
        )}
      </div>
      {!dashboard && (
        <GoalChoices selected={goal} disabled={pending} choose={(selected) => void save({ kind: "setGoal", goal: selected })} />
      )}
      {dashboard && goal && <p className="text-sm text-gray-700">{t(goals[goal].label)}</p>}
      {goal && progress && <GoalProgress goal={goal} progress={progress} />}
      {dashboard && (
        <Link href="/manuals" className={actionLink}>
          {t(goal ? "ownerOnboarding.changeGoal" : "ownerOnboarding.chooseGoal")}
        </Link>
      )}
      {goal === "schedule" && !dashboard && (
        <Link href="/jobs/new" className={actionLink}>{t("learningCenter.fullScheduling")}</Link>
      )}
      {failed && <p role="alert" className="text-sm text-red-700">{t("ownerOnboarding.saveError")}</p>}
    </section>
  );
}
