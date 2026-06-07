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
    // Show once the user has scrolled past the cinematic overture, hide
    // again when the play section enters the viewport.
    const sentinel = document.querySelector("[data-overture-end]");
    const playEl = document.getElementById("chapter-x");
    if (!sentinel) return;

    let playInView = false;
    const update = () => {
      const top = sentinel.getBoundingClientRect().top;
      const pastOverture = top <= 0;
      setVisible(pastOverture && !playInView);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    let playObs: IntersectionObserver | null = null;
    if (playEl) {
      playObs = new IntersectionObserver(
        (entries) => {
          for (const e of entries) playInView = e.isIntersecting;
          update();
        },
        { threshold: 0 },
      );
      playObs.observe(playEl);
    }
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      playObs?.disconnect();
    };
  }, []);

  return (
    <a
      href="#chapter-x"
      aria-label={STRINGS.playCta.ariaLabel[lang]}
      className={`play-cta fixed bottom-6 right-6 z-50 mono text-[10px] tracking-[0.28em] uppercase
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
