import { useEffect } from "react";
import { Route, Switch, Redirect, useLocation } from "wouter";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { OfflineIndicator } from "@/components/shared/OfflineIndicator";

// Auth pages
import { LandingPage } from "@/pages/auth/LandingPage";
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
import { AnalyticsPage } from "@/pages/owner/AnalyticsPage";
import { SubscribePage } from "@/pages/owner/SubscribePage";
import { BillingSuccessPage } from "@/pages/owner/BillingSuccessPage";
import { BillingCancelPage } from "@/pages/owner/BillingCancelPage";
import { PartnersPage } from "@/pages/owner/PartnersPage";
import { RequestListPage } from "@/pages/owner/RequestListPage";
import { RequestDetailPage } from "@/pages/owner/RequestDetailPage";
import { SiteSetupPage } from "@/pages/owner/SiteSetupPage";
import { CleanerLeadsPage } from "@/pages/owner/CleanerLeadsPage";
import { AffiliatePage } from "@/pages/owner/AffiliatePage";

// Worker pages (cleaner + maintenance unified)
import { WorkerJobListPage } from "@/pages/worker/WorkerJobListPage";
import { WorkerJobDetailPage } from "@/pages/worker/WorkerJobDetailPage";
import { WorkerJobFormPage } from "@/pages/worker/WorkerJobFormPage";

// Admin pages
import { SuperAdminPage } from "@/pages/admin/SuperAdminPage";

// Shared pages
import { NotificationsPage } from "@/pages/shared/NotificationsPage";
import { ManualsPage } from "@/pages/shared/ManualsPage";
import { ManualViewerPage } from "@/pages/shared/ManualViewerPage";
import { PayoutRequestPage } from "@/pages/shared/PayoutRequestPage";
import { StripeReturnPage } from "@/pages/shared/StripeReturnPage";

// Public pages (no auth required)
import { PublicRequestPage } from "@/pages/public/PublicRequestPage";
import { PublicSitePage } from "@/pages/public/PublicSitePage";
import { CleanerStubPage } from "@/pages/public/CleanerStubPage";
import { ClientPortalPage } from "@/pages/public/ClientPortalPage";

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

  // ── Capture ?ref= param on first load ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) {
      localStorage.setItem("scrubadub_ref", ref);
      params.delete("ref");
      const qs = params.toString();
      const newUrl = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
      window.history.replaceState(null, "", newUrl);
    }
  }, []);

  const subscription = useQuery(
    api.queries.billing.getCompanySubscription,
    user?.companyId ? { companyId: user.companyId } : "skip"
  );

  // --- Derived state ---
  const isAuthed = Boolean(userId || storedUserId);
  // DEV bypass to prevent local onboarding/subscription deadlock
  const devBypass = import.meta.env.DEV && !!user;
  // != null catches both undefined (loading) and null (company not found)
  const subSettled = devBypass || (subscription != null) || !user?.companyId;

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
  const accessOk = devBypass || isSubActive || isInGracePeriod;

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
      {`path=${pathname} | stored=${storedUserId ? "yes" : "no"} | userId=${userId ? "yes" : "no"} | authLoading=${isLoading} | isAuthed=${isAuthed} | email=${user?.email ?? "-"} | devBypass=${devBypass} | companyBypassed=${companyBypassed} | subActive=${isSubActive} | accessOk=${accessOk} | branch=${redirectBranch}`}
    </div>
  ) : null;

  // --- PUBLIC ROUTES: bypass all auth guards, no layout ---
  if (pathname.startsWith("/r/")) {
    return (
      <ErrorBoundary>
        <Route path="/r/:token" component={PublicRequestPage} />
      </ErrorBoundary>
    );
  }

  if (pathname.startsWith("/c/")) {
    return (
      <ErrorBoundary>
        <Route path="/c/:token" component={ClientPortalPage} />
      </ErrorBoundary>
    );
  }

  // Public mini-site routes: /:slug and /:slug/cleaner
  // Match paths that look like a slug (not a known app route)
  const knownPrefixes = [
    "/login", "/signup", "/forgot-password", "/reset-password",
    "/invite", "/subscribe", "/billing", "/properties", "/employees",
    "/jobs", "/calendar", "/red-flags", "/performance", "/analytics",
    "/partners", "/requests", "/cleaner-leads", "/audit-log", "/notifications", "/manuals",
    "/admin", "/site", "/affiliate",
  ];
  const isKnownRoute = pathname === "/" || knownPrefixes.some((p) => pathname.startsWith(p));
  const slugMatch = !isKnownRoute && /^\/[a-z0-9][a-z0-9-]+/.test(pathname);

  if (slugMatch) {
    return (
      <ErrorBoundary>
        <Switch>
          <Route path="/:slug/cleaner" component={CleanerStubPage} />
          <Route path="/:slug" component={PublicSitePage} />
        </Switch>
      </ErrorBoundary>
    );
  }

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
          <Route path="/" component={LandingPage} />
          <Route path="/login" component={LoginPage} />
          <Route path="/signup" component={SignupPage} />
          <Route path="/forgot-password" component={ForgotPasswordPage} />
          <Route path="/reset-password/:token" component={ResetPasswordPage} />
          <Route path="/invite/:token" component={AcceptInvitePage} />
          <Route>
            <Redirect to="/" />
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
                <Route path="/analytics" component={AnalyticsPage} />
                <Route path="/partners" component={PartnersPage} />
                <Route path="/requests/:id" component={RequestDetailPage} />
                <Route path="/requests" component={RequestListPage} />
                <Route path="/cleaner-leads" component={CleanerLeadsPage} />
                <Route path="/audit-log" component={AuditLogPage} />
                <Route path="/subscribe" component={SubscribePage} />
                <Route path="/billing/success" component={BillingSuccessPage} />
                <Route path="/billing/cancel" component={BillingCancelPage} />
                <Route path="/site" component={SiteSetupPage} />
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
          <Route path="/affiliate/stripe/return" component={StripeReturnPage} />
          <Route path="/affiliate/stripe/refresh" component={StripeReturnPage} />
          <Route path="/affiliate/payout-request/:requestId" component={PayoutRequestPage} />
          <Route path="/affiliate" component={AffiliatePage} />
          <Route path="/notifications" component={NotificationsPage} />
          <Route path="/manuals/:slug" component={ManualViewerPage} />
          <Route path="/manuals" component={ManualsPage} />
          <Route path="/admin" component={SuperAdminPage} />
          <Route path="/invite/:token" component={AcceptInvitePage} />
          <Route>
            <Redirect to="/" />
          </Route>
        </Switch>
      </AppLayout>
    </ErrorBoundary>
  );
}
