import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import * as Sentry from "@sentry/react";

import App from "./App";
import "./index.css";
import "./i18n";
import { FeedbackProvider } from "./components/ui/FeedbackProvider";
import { DemoApp } from "./demo/DemoApp";
import { shouldRenderDemoApp } from "./demo/demoRoute";
import { ShowcaseEntryPage } from "./pages/demo/ShowcaseEntryPage";
import { EnvironmentBanner } from "./components/shared/EnvironmentBanner";

const showcaseEntry = window.location.pathname === "/showcase";
const demoMode = shouldRenderDemoApp(
  window.location.pathname,
  import.meta.env.VITE_ENABLE_DEMO_MODE,
);

if (showcaseEntry) {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ShowcaseEntryPage />
    </React.StrictMode>,
  );
} else if (demoMode) {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <DemoApp />
    </React.StrictMode>,
  );
} else {
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      environment: import.meta.env.MODE,
      sampleRate: 1.0,
      // Keep noise low — only unhandled errors + explicit captures
    });
  }

  const convexUrl = import.meta.env.VITE_CONVEX_URL;
  if (!convexUrl) {
    document.getElementById("root")!.innerHTML =
      '<div style="font-family:system-ui;padding:2rem">' +
      "<h1>Missing VITE_CONVEX_URL</h1>" +
      "<p>Run <code>npx convex dev</code> from the repo root to generate " +
      "<code>.env.local</code>, then restart Vite.</p></div>";
  } else {
    const convex = new ConvexReactClient(convexUrl);

    ReactDOM.createRoot(document.getElementById("root")!).render(
      <React.StrictMode>
        <EnvironmentBanner />
        <ConvexProvider client={convex}>
          <FeedbackProvider>
            <App />
          </FeedbackProvider>
        </ConvexProvider>
      </React.StrictMode>,
    );
  }
}

// Register service worker for PWA (production only)
if (!demoMode && import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
