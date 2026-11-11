import React from "react";
import { createRoot } from "react-dom/client";
import "../../../packages/frontend/src/index.css";
import "../../../packages/frontend/src/i18n";
import { GiveawayPage } from "../../../packages/frontend/src/pages/public/GiveawayPage";

// Loaded only by the isolated browser QA server. No production Convex client is created.
createRoot(document.getElementById("root")!).render(<GiveawayPage />);
