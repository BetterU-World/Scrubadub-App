import { Route, Switch, Redirect, useLocation } from "wouter";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { OfflineIndicator } from "@/components/shared/OfflineIndicator";

// Auth pages
import { LoginPage } from "@/pages/auth/LoginPage";
import { SignupPage } from "@/pages/auth/SignupPage";
import { AcceptInvitePage } from "@/pages/auth/AcceptInvitePage";
import { ForgotPasswordPage } from "@/pages/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "@/pages/auth/ResetPasswordPage";

// Owner pages
import { DashboardPage } from "@/pages/owner/DashboardPage";
import { PropertyListPage } from "@/pages/owner/PropertyListPage";
import { PropertyFormPage } from "@/pages/owner/PropertyFormPage";
import { PropertyDetailPage } from "@/pages/owner/PropertyDetailPage";
import { EmployeeListPage } from "@/pages/owner/EmployeeListPage";
import { JobListPage } from "@/pages/owner/JobListPage";
import { JobFormPage } from "@/pages/owner/JobFormPage";
import { JobDetailPage } from "@/pages/owner/JobDetailPage";
import { CalendarPage } from "@/pages/owner/CalendarPage";
import { RedFlagsDashboard } from "@/pages/owner/RedFlagsDashboard";
import { AuditLogPage } from "@/pages/owner/AuditLogPage";
import { PerformancePage } from "@/pages/owner/PerformancePage";
import { SubscribePage } from "@/pages/owner/SubscribePage";
import { BillingSuccessPage } from "@/pages/owner/BillingSuccessPage";
import { BillingCancelPage } from "@/pages/owner/BillingCancelPage";

// Worker pages (cleaner + maintenance unified)
import { WorkerJobListPage } from "@/pages/worker/WorkerJobListPage";
import { WorkerJobDetailPage } from "@/pages/worker/WorkerJobDetailPage";
import { WorkerJobFormPage } from "@/pages/worker/WorkerJobFormPage";

// Shared pages
import { NotificationsPage } from "@/pages/shared/NotificationsPage";

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function SubscriptionInactive() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Subscription Inactive
      </h1>
      <p className="text-gray-500">
        Your company's subscription is no longer active. Please contact your
        employer.
      </p>
    </div>
  );
}

export default function App() {
  const { user, userId, isLoading, isAuthenticated } = useAuth();
  const [pathname] = useLocation();
  const storedUserId = localStorage.getItem("scrubadub_userId");

  const subscription = useQuery(
    api.queries.billing.getCompanySubscription,
    user?.companyId ? { companyId: user.companyId } : "skip"
  );

  // --- Derived state ---
  const isAuthed = Boolean(userId || storedUserId);
  // != null catches both undefined (loading) and null (company not found)
  const subSettled = (subscription != null) || !user?.companyId;

  const isOwner = user?.role === "owner";
  const companyBypassed = subscription?.companyBypassed === true;
  const isSubActive =
    companyBypassed ||
    subscription?.subscriptionStatus === "trialing" ||
    subscription?.subscriptionStatus === "active";
  const isInGracePeriod =
    !isSubActive &&
    subscription?.subscriptionBecameInactiveAt != null &&
    Date.now() - subscription.subscriptionBecameInactiveAt < THREE_DAYS_MS;
  const accessOk = isSubActive || isInGracePeriod;

  // --- Determine which guard branch we hit ---
  let redirectBranch = "app";
  if (isLoading) {
    redirectBranch = "auth-loading";
  } else if (!isAuthed && !isAuthenticated) {
    redirectBranch = "no-auth→/login";
  } else if (isAuthed && !isAuthenticated) {
    redirectBranch = "query-settling";
  } else if (!subSettled) {
    redirectBranch = "sub-loading";
  } else if (isOwner && !accessOk) {
    redirectBranch = "no-access→/subscribe";
  }

  // --- DEV banner (enable: localStorage.setItem("DEBUG_AUTH_BANNER","1"); location.reload();) ---
  const devBanner = import.meta.env.DEV && localStorage.getItem("DEBUG_AUTH_BANNER") === "1" ? (
    <div style={{position:"fixed",bottom:0,left:0,right:0,padding:"4px 8px",background:"rgba(0,0,0,0.9)",color:"#0f0",fontSize:10,fontFamily:"monospace",zIndex:99999,whiteSpace:"nowrap",overflow:"auto"}}>
      {`path=${pathname} | stored=${storedUserId ? "yes" : "no"} | userId=${userId ? "yes" : "no"} | authLoading=${isLoading} | isAuthed=${isAuthed} | email=${user?.email ?? "-"} | companyBypassed=${companyBypassed} | subActive=${isSubActive} | accessOk=${accessOk} | branch=${redirectBranch}`}
    </div>
  ) : null;

  // --- GUARD 1: Auth still loading — show spinner, NEVER redirect ---
  if (isLoading) {
    return <>{devBanner}<PageLoader /></>;
  }

  // --- GUARD 2: storedUserId exists but query hasn't resolved yet — wait ---
  if (isAuthed && !isAuthenticated) {
    return <>{devBanner}<PageLoader /></>;
  }

  // --- GUARD 3: Definitely not authenticated — show login routes ---
  if (!isAuthed && !isAuthenticated) {
    return (
      <ErrorBoundary>
        <OfflineIndicator />
        {devBanner}
        <Switch>
          <Route path="/login" component={LoginPage} />
          <Route path="/signup" component={SignupPage} />
          <Route path="/forgot-password" component={ForgotPasswordPage} />
          <Route path="/reset-password/:token" component={ResetPasswordPage} />
          <Route path="/invite/:token" component={AcceptInvitePage} />
          <Route>
            <Redirect to="/login" />
          </Route>
        </Switch>
      </ErrorBoundary>
    );
  }

  // --- GUARD 4: Authenticated but subscription data still loading ---
  if (!subSettled) {
    return <>{devBanner}<PageLoader /></>;
  }

  // --- GUARD 5: Fully resolved — render app with access control ---
  return (
    <ErrorBoundary>
      <OfflineIndicator />
      {devBanner}
      <AppLayout>
        <Switch>
          {isOwner ? (
            accessOk ? (
              <>
                <Route path="/" component={DashboardPage} />
                <Route path="/properties" component={PropertyListPage} />
                <Route path="/properties/new" component={PropertyFormPage} />
                <Route
                  path="/properties/:id/edit"
                  component={PropertyFormPage}
                />
                <Route path="/properties/:id" component={PropertyDetailPage} />
                <Route path="/employees" component={EmployeeListPage} />
                <Route path="/jobs" component={JobListPage} />
                <Route path="/jobs/new" component={JobFormPage} />
                <Route path="/jobs/:id/edit" component={JobFormPage} />
                <Route path="/jobs/:id" component={JobDetailPage} />
                <Route path="/calendar" component={CalendarPage} />
                <Route path="/red-flags" component={RedFlagsDashboard} />
                <Route path="/performance" component={PerformancePage} />
                <Route path="/audit-log" component={AuditLogPage} />
                <Route path="/subscribe" component={SubscribePage} />
                <Route path="/billing/success" component={BillingSuccessPage} />
                <Route path="/billing/cancel" component={BillingCancelPage} />
              </>
            ) : (
              <>
                <Route path="/subscribe" component={SubscribePage} />
                <Route path="/billing/success" component={BillingSuccessPage} />
                <Route path="/billing/cancel" component={BillingCancelPage} />
                <Route>
                  <Redirect to="/subscribe" />
                </Route>
              </>
            )
          ) : accessOk ? (
            <>
              <Route path="/" component={WorkerJobListPage} />
              <Route path="/jobs/:id" component={WorkerJobDetailPage} />
              <Route path="/jobs/:id/form" component={WorkerJobFormPage} />
              <Route path="/calendar" component={CalendarPage} />
            </>
          ) : (
            <Route>
              <SubscriptionInactive />
            </Route>
          )}
          <Route path="/notifications" component={NotificationsPage} />
          <Route path="/invite/:token" component={AcceptInvitePage} />
          <Route>
            <Redirect to="/" />
          </Route>
        </Switch>
      </AppLayout>
    </ErrorBoundary>
  );
}
