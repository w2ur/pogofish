import { createRoot } from "react-dom/client";
import { ensureEngineReady } from "../engine/init";
import { BoardApp } from "./BoardApp";
import { handleThemeMessage, parseLang, parseTheme } from "./embed";
import "./board.css";

const root = document.documentElement;
const lang = parseLang(location.search);
root.lang = lang;
root.dataset.theme = parseTheme(
  location.search,
  window.matchMedia("(prefers-color-scheme: dark)").matches,
);
window.addEventListener("message", (event) =>
  handleThemeMessage(event, location.origin, root),
);

ensureEngineReady().then(() => {
  createRoot(document.getElementById("root")!).render(<BoardApp lang={lang} />);
});
