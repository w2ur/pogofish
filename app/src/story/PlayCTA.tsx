import { useEffect, useState } from "react";
import { useLang } from "./LangContext";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import { STRINGS } from "./i18n";

/**
 * Persistent "play" shortcut pill. Fades in once the reader has scrolled past
 * the hook scene, fades out when the play section itself enters the viewport.
 */
export function PlayCTA() {
  const [visible, setVisible] = useState(false);
  const { lang } = useLang();
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const hookEl = document.querySelector("section:first-of-type");
    const playEl = document.getElementById("play");
    if (!hookEl || !playEl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === hookEl && !entry.isIntersecting) {
            setVisible(true);
          }
          if (entry.target === hookEl && entry.isIntersecting) {
            setVisible(false);
          }
          if (entry.target === playEl && entry.isIntersecting) {
            setVisible(false);
          }
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(hookEl);
    observer.observe(playEl);
    return () => observer.disconnect();
  }, []);

  return (
    <a
      href="#play"
      aria-label={STRINGS.playCta.ariaLabel[lang]}
      className={`fixed bottom-6 right-6 z-50 mono text-[10px] tracking-[0.28em] uppercase
        rounded-full bg-vermilion text-ink px-5 py-3 shadow-lg shadow-black/40
        hover:bg-vermilion-soft
        ${reducedMotion ? "" : "transition-all duration-300 ease-out"}
        ${visible
          ? "opacity-100 translate-y-0"
          : `opacity-0 pointer-events-none ${reducedMotion ? "" : "translate-y-4"}`}`}
    >
      {STRINGS.playCta.label[lang]}
    </a>
  );
}
