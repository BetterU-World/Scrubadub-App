import { DemoOwnerPage } from "@/pages/demo/DemoOwnerPage";
import {
  DemoOwnerDetailPage,
  DemoOwnerOperationsPage,
} from "@/pages/demo/DemoOwnerOperationsPages";
import {
  DemoOwnerJobDetailPage,
  DemoOwnerJobsPage,
} from "@/pages/demo/DemoOwnerJobPages";
import { DemoWorkerPage } from "@/pages/demo/DemoWorkerPage";
import { DemoWorkerOperationsPage } from "@/pages/demo/DemoWorkerOperationsPages";
import {
  DemoClientPage,
  DemoClientRequestDetailPage,
} from "@/pages/demo/DemoClientPage";
import {
  DemoWorkerChecklistPage,
  DemoWorkerJobDetailPage,
  DemoWorkerJobsPage,
} from "@/pages/demo/DemoWorkerJourneyPages";
import { Route, Router, Switch, useLocation } from "wouter";
import { getDemoPersona, isDemoPresentationMode } from "./demoRoute";
import { ShowcaseNotFoundPage } from "./ShowcaseNotFoundPage";
import { ShowcasePlaceholderPage } from "./ShowcasePlaceholderPage";
import {
  buildShowcasePath,
  getShowcasePages,
  workerShowcaseJourneyRoutes,
} from "./showcaseRegistry";

export function DemoApp() {
  return (
    <Router>
      <ShowcaseRoutes />
    </Router>
  );
}

function ShowcaseRoutes() {
  const [location] = useLocation();
  const presentation = isDemoPresentationMode(window.location.search);
  const persona = getDemoPersona(window.location.pathname) ?? "owner";
  const pages = getShowcasePages(persona);

  return (
    <Switch location={location}>
      {persona === "owner" && (
        <Route path={buildShowcasePath("owner", "/properties/:id")}>
          {(params) => (
            <DemoOwnerDetailPage
              kind="property"
              id={(params as Record<string, string>).id}
              presentation={presentation}
              currentPath={location}
            />
          )}
        </Route>
      )}
      {persona === "owner" && (
        <Route path={buildShowcasePath("owner", "/employees/:id")}>
          {(params) => (
            <DemoOwnerDetailPage
              kind="employee"
              id={(params as Record<string, string>).id}
              presentation={presentation}
              currentPath={location}
            />
          )}
        </Route>
      )}
      {persona === "owner" && (
        <Route path={buildShowcasePath("owner", "/requests/:id")}>
          {(params) => (
            <DemoOwnerDetailPage
              kind="request"
              id={(params as Record<string, string>).id}
              presentation={presentation}
              currentPath={location}
            />
          )}
        </Route>
      )}
      {persona === "owner" && (
        <Route path={buildShowcasePath("owner", "/clients/:id")}>
          {(params) => (
            <DemoOwnerDetailPage
              kind="client"
              id={(params as Record<string, string>).id}
              presentation={presentation}
              currentPath={location}
            />
          )}
        </Route>
      )}
      {persona === "owner" && (
        <Route path={buildShowcasePath("owner", "/commercial-accounts/:id")}>
          {(params) => (
            <DemoOwnerDetailPage
              kind="commercial"
              id={(params as Record<string, string>).id}
              presentation={presentation}
              currentPath={location}
            />
          )}
        </Route>
      )}
      {persona === "owner" && (
        <Route path={buildShowcasePath("owner", "/jobs/:id")}>
          {(params) => (
            <DemoOwnerJobDetailPage
              jobId={(params as Record<string, string>).id}
              presentation={presentation}
              currentPath={location}
            />
          )}
        </Route>
      )}
      {persona === "worker" && (
        <Route
          path={buildShowcasePath(
            "worker",
            workerShowcaseJourneyRoutes.checklist,
          )}
        >
          {(params) => (
            <DemoWorkerChecklistPage
              showcaseJobId={(params as Record<string, string>).showcaseJobId}
              presentation={presentation}
              currentPath={location}
            />
          )}
        </Route>
      )}
      {persona === "client" && (
        <Route path={buildShowcasePath("client", "/requests/:requestId")}>
          {(params) => (
            <DemoClientRequestDetailPage
              requestId={(params as Record<string, string>).requestId}
              presentation={presentation}
              currentPath={location}
            />
          )}
        </Route>
      )}
      {persona === "worker" && (
        <Route
          path={buildShowcasePath(
            "worker",
            workerShowcaseJourneyRoutes.jobDetail,
          )}
        >
          {(params) => (
            <DemoWorkerJobDetailPage
              showcaseJobId={(params as Record<string, string>).showcaseJobId}
              presentation={presentation}
              currentPath={location}
            />
          )}
        </Route>
      )}
      {pages.map((page) => (
        <Route
          key={page.id}
          path={buildShowcasePath(persona, page.relativePath)}
        >
          {page.availability === "implemented" ? (
            persona === "client" ? (
              <DemoClientPage
                page={page.relativePath}
                presentation={presentation}
                currentPath={location}
              />
            ) : persona === "worker" &&
              page.relativePath === workerShowcaseJourneyRoutes.jobs ? (
              <DemoWorkerJobsPage
                presentation={presentation}
                currentPath={location}
              />
            ) : persona === "worker" ? (
              page.relativePath === "/" ? (
                <DemoWorkerPage
                  presentation={presentation}
                  currentPath={location}
                />
              ) : (
                <DemoWorkerOperationsPage
                  page={page.relativePath}
                  presentation={presentation}
                  currentPath={location}
                />
              )
            ) : page.relativePath === "/" ? (
              <DemoOwnerPage
                presentation={presentation}
                currentPath={location}
              />
            ) : page.relativePath === "/jobs" ? (
              <DemoOwnerJobsPage
                presentation={presentation}
                currentPath={location}
              />
            ) : (
              <DemoOwnerOperationsPage
                page={page.relativePath}
                presentation={presentation}
                currentPath={location}
              />
            )
          ) : (
            <ShowcasePlaceholderPage
              page={page}
              presentation={presentation}
              currentPath={location}
            />
          )}
        </Route>
      ))}
      <Route>
        <ShowcaseNotFoundPage
          persona={persona}
          presentation={presentation}
          currentPath={location}
        />
      </Route>
    </Switch>
  );
}
