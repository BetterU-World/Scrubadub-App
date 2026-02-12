import { Route, Switch, Redirect } from "wouter";
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

// Cleaner pages
import { CleanerJobListPage } from "@/pages/cleaner/CleanerJobListPage";
import { CleanerJobDetailPage } from "@/pages/cleaner/CleanerJobDetailPage";
import { CleaningFormPage } from "@/pages/cleaner/CleaningFormPage";

// Shared pages
import { NotificationsPage } from "@/pages/shared/NotificationsPage";

export default function App() {
  const { user, isLoading, isAuthenticated } = useAuth();

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

  const isOwner = user?.role === "owner";

  return (
    <ErrorBoundary>
      <OfflineIndicator />
      <AppLayout>
        <Switch>
          {isOwner ? (
            <>
              <Route path="/" component={DashboardPage} />
              <Route path="/properties" component={PropertyListPage} />
              <Route path="/properties/new" component={PropertyFormPage} />
              <Route path="/properties/:id/edit" component={PropertyFormPage} />
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
            </>
          ) : (
            <>
              <Route path="/" component={CleanerJobListPage} />
              <Route path="/jobs/:id" component={CleanerJobDetailPage} />
              <Route path="/jobs/:id/form" component={CleaningFormPage} />
              <Route path="/calendar" component={CalendarPage} />
            </>
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
