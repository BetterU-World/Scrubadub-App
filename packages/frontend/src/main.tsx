import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";

import App from "./App";
import "./index.css";

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
      <ConvexProvider client={convex}>
        <App />
      </ConvexProvider>
    </React.StrictMode>
  );
}

// Register service worker for PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
