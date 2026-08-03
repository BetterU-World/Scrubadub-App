import { DemoOwnerPage } from "@/pages/demo/DemoOwnerPage";
import { DemoWorkerPage } from "@/pages/demo/DemoWorkerPage";
import { DemoClientPage, DemoClientRequestDetailPage } from "@/pages/demo/DemoClientPage";
import {
  DemoWorkerChecklistPage,
  DemoWorkerJobDetailPage,
  DemoWorkerJobsPage,
} from "@/pages/demo/DemoWorkerJourneyPages";
import { Route, Router, Switch, useLocation } from "wouter";
import { getDemoPersona, isDemoPresentationMode } from "./demoRoute";
import { ShowcaseNotFoundPage } from "./ShowcaseNotFoundPage";
import { ShowcasePlaceholderPage } from "./ShowcasePlaceholderPage";
import { buildShowcasePath, getShowcasePages, workerShowcaseJourneyRoutes } from "./showcaseRegistry";

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
      {persona === "worker" && <Route path={buildShowcasePath("worker", workerShowcaseJourneyRoutes.checklist)}>
        {(params) => <DemoWorkerChecklistPage showcaseJobId={(params as Record<string, string>).showcaseJobId} presentation={presentation} currentPath={location} />}
      </Route>}
      {persona === "client" && <Route path={buildShowcasePath("client", "/requests/:requestId")}>
        {(params) => <DemoClientRequestDetailPage requestId={(params as Record<string, string>).requestId} presentation={presentation} currentPath={location} />}
      </Route>}
      {persona === "worker" && <Route path={buildShowcasePath("worker", workerShowcaseJourneyRoutes.jobDetail)}>
        {(params) => <DemoWorkerJobDetailPage showcaseJobId={(params as Record<string, string>).showcaseJobId} presentation={presentation} currentPath={location} />}
      </Route>}
      {pages.map((page) => (
        <Route key={page.id} path={buildShowcasePath(persona, page.relativePath)}>
          {page.availability === "implemented" ? (
            persona === "client" ? (
              <DemoClientPage page={page.relativePath} presentation={presentation} currentPath={location} />
            ) : persona === "worker" && page.relativePath === workerShowcaseJourneyRoutes.jobs ? (
              <DemoWorkerJobsPage presentation={presentation} currentPath={location} />
            ) : persona === "worker" ? (
              <DemoWorkerPage presentation={presentation} currentPath={location} />
            ) : (
              <DemoOwnerPage presentation={presentation} currentPath={location} />
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
