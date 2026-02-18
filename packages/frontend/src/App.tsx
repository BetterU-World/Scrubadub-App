import { Route, Switch, Redirect } from "wouter";
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

// Cleaner pages
import { CleanerJobListPage } from "@/pages/cleaner/CleanerJobListPage";
import { CleanerJobDetailPage } from "@/pages/cleaner/CleanerJobDetailPage";
import { CleaningFormPage } from "@/pages/cleaner/CleaningFormPage";

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
  const { user, isLoading, isAuthenticated } = useAuth();
  const subscription = useQuery(
    api.queries.billing.getCompanySubscription,
    user?.companyId ? { companyId: user.companyId } : "skip"
  );

  if (isLoading) return <PageLoader />;

  if (!isAuthenticated) {
    return (
      <ErrorBoundary>
        <OfflineIndicator />
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

  // Wait for subscription data before rendering gated routes
  if (subscription === undefined) return <PageLoader />;

  const isOwner = user?.role === "owner";
  const isSubActive =
    subscription?.subscriptionStatus === "trialing" ||
    subscription?.subscriptionStatus === "active";
  const isInGracePeriod =
    !isSubActive &&
    subscription?.subscriptionBecameInactiveAt != null &&
    Date.now() - subscription.subscriptionBecameInactiveAt < THREE_DAYS_MS;

  return (
    <ErrorBoundary>
      <OfflineIndicator />
      <AppLayout>
        <Switch>
          {isOwner ? (
            isSubActive ? (
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
          ) : isSubActive || isInGracePeriod ? (
            <>
              <Route path="/" component={CleanerJobListPage} />
              <Route path="/jobs/:id" component={CleanerJobDetailPage} />
              <Route path="/jobs/:id/form" component={CleaningFormPage} />
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
