import { useEffect, useState } from "react";
import { useLang } from "./LangContext";

/**
 * Language switch pill, fixed bottom-left. Hides while the playable game
 * (chapter X) is on screen so it doesn't sit over the board's bottom-left
 * cell on small viewports — the game is the climax interaction and its hit
 * area must stay clear.
 */
export function LangToggle() {
  const { lang, setLang } = useLang();
  const [playInView, setPlayInView] = useState(false);

  useEffect(() => {
    const playEl = document.getElementById("chapter-x");
    if (!playEl) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) setPlayInView(e.isIntersecting);
      },
      { threshold: 0 },
    );
    obs.observe(playEl);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      className={`lang-toggle fixed bottom-6 left-6 z-50 flex gap-1 rounded-full p-1 shadow-lg transition-opacity duration-300
        ${playInView ? "opacity-0 pointer-events-none lg:opacity-100 lg:pointer-events-auto" : "opacity-100"}`}
      style={{ background: "rgba(18,16,14,0.8)", backdropFilter: "blur(6px)" }}
    >
      {(["en", "fr"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          className={`mono text-[10px] tracking-[0.2em] uppercase rounded-full px-3 py-2 transition-colors
            ${lang === l ? "bg-vermilion text-paper" : "text-paper-3 hover:text-paper"}`}
          aria-pressed={lang === l}
          aria-label={l === "en" ? "English" : "Français"}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
