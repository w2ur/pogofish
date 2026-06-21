import { useEffect, useState } from "react";
import { useLang } from "./LangContext";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  prompt(): Promise<void>;
}

/**
 * Contextual PWA install nudge shown at the end of the article (near the
 * epilogue), using the native beforeinstallprompt API.
 *
 * Conditions for showing:
 * 1. Browser fires beforeinstallprompt (Chrome/Edge on Android/desktop).
 * 2. User has scrolled past chapter XII (the epilogue) — contextual placement.
 * 3. Not already dismissed in this session (stored in sessionStorage).
 *
 * On accept/dismiss the nudge disappears. No repeat in the same session.
 */
export function InstallNudge() {
  const { lang } = useLang();
  const reducedMotion = usePrefersReducedMotion();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Capture the deferred prompt from the browser.
  useEffect(() => {
    const alreadyDismissed = sessionStorage.getItem("pogofish.install.dismissed") === "1";
    if (alreadyDismissed) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Show once the reader has scrolled into chapter XII (the epilogue).
  useEffect(() => {
    if (!deferredPrompt || dismissed) return;

    const epilogueEl = document.getElementById("chapter-xii");
    if (!epilogueEl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setVisible(true);
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(epilogueEl);
    return () => observer.disconnect();
  }, [deferredPrompt, dismissed]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted" || outcome === "dismissed") {
      sessionStorage.setItem("pogofish.install.dismissed", "1");
      setDismissed(true);
      setVisible(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    sessionStorage.setItem("pogofish.install.dismissed", "1");
    setDismissed(true);
    setVisible(false);
  };

  if (!deferredPrompt || dismissed) return null;

  const isShown = visible && !dismissed;

  return (
    <div
      role="complementary"
      aria-label={lang === "en" ? "Install Pogofish" : "Installer Pogofish"}
      className={[
        "fixed bottom-6 left-6 z-50 max-w-[260px]",
        "border border-hair bg-ink-2/95 rounded-sm shadow-xl shadow-black/40",
        "px-4 py-4 flex flex-col gap-3",
        reducedMotion ? "" : "transition-all duration-300 ease-out",
        isShown
          ? "opacity-100 translate-y-0"
          : "opacity-0 pointer-events-none translate-y-4",
      ].join(" ")}
    >
      {/* dismiss button */}
      <button
        onClick={handleDismiss}
        aria-label={lang === "en" ? "Dismiss" : "Fermer"}
        className="absolute top-2 right-2 mono text-[10px] text-paper-3 hover:text-paper transition-colors leading-none p-1"
      >
        ✕
      </button>

      <div className="pr-4">
        <p className="mono text-[10px] tracking-[0.25em] uppercase text-vermilion mb-1">
          {lang === "en" ? "Install app" : "Installer l'app"}
        </p>
        <p className="text-paper-2 text-[0.8125rem] leading-[1.5]">
          {lang === "en"
            ? "Play offline — add Pogofish to your home screen."
            : "Jouez hors ligne — ajoutez Pogofish à l'écran d'accueil."}
        </p>
      </div>

      <button
        onClick={handleInstall}
        className="mono text-[10px] tracking-[0.22em] uppercase self-start px-3 py-2
          border border-vermilion text-vermilion hover:bg-vermilion hover:text-ink
          transition-colors"
      >
        {lang === "en" ? "Add to home screen" : "Ajouter à l'écran d'accueil"}
      </button>
    </div>
  );
}
