import { DemoOwnerPage } from "@/pages/demo/DemoOwnerPage";
import { DemoWorkerPage } from "@/pages/demo/DemoWorkerPage";
import { Route, Router, Switch, useLocation } from "wouter";
import { getDemoPersona, isDemoPresentationMode } from "./demoRoute";
import { ShowcaseNotFoundPage } from "./ShowcaseNotFoundPage";
import { ShowcasePlaceholderPage } from "./ShowcasePlaceholderPage";
import { buildShowcasePath, getShowcasePages } from "./showcaseRegistry";

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
      {pages.map((page) => (
        <Route key={page.id} path={buildShowcasePath(persona, page.relativePath)}>
          {page.availability === "implemented" && page.relativePath === "/" ? (
            persona === "worker" ? (
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
