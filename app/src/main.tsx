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
  if (window.location.hash === "#play") {
    requestAnimationFrame(() => {
      document.getElementById("play")?.scrollIntoView({ behavior: "smooth" });
    });
  }
});
