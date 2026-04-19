import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ensureEngineReady } from "./engine/init";
import "./index.css";

ensureEngineReady().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

  // Honor #play hash on cold load: smooth-scroll once layout has settled.
  // Respect prefers-reduced-motion: no smooth animation for users who asked for less.
  if (window.location.hash === "#play") {
    const behavior: ScrollBehavior = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches
      ? "auto"
      : "smooth";
    requestAnimationFrame(() => {
      document.getElementById("play")?.scrollIntoView({ behavior });
    });
  }
});
