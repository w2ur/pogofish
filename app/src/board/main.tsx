import { createRoot } from "react-dom/client";
import { ensureEngineReady } from "../engine/init";
import { BoardApp } from "./BoardApp";
import { failureText } from "./strings";
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

const mount = document.getElementById("root")!;
ensureEngineReady().then(
  () => createRoot(mount).render(<BoardApp lang={lang} />),
  () => {
    const message = document.createElement("p");
    message.setAttribute("role", "status");
    message.style.cssText = "margin:0;padding:16px;font-size:14px;text-align:center";
    message.textContent = failureText(lang);
    mount.replaceChildren(message);
  },
);
