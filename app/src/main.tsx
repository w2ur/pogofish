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
});
