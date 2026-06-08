import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Lang = "en" | "fr";

interface LangContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

const LangContext = createContext<LangContextValue | null>(null);
export const LANG_STORAGE_KEY = "pogofish.lang";

/**
 * Language is URL-authoritative: `/fr` (and `/fr/…`) is French, everything else
 * is English (the x-default). Deriving the language from the path keeps the
 * rendered language in lockstep with the prerendered document and its
 * canonical/hreflang, so there is never a client re-render that flips language
 * out from under the static HTML.
 *
 * First-visit auto-detection (a French browser arriving at `/`) is handled by a
 * tiny inline redirect in index.html that runs before React — so it can bounce
 * to `/fr` without an English flash, while honouring an explicit stored choice.
 */
export function detectInitialLang(pathname: string): Lang {
  return pathname === "/fr" || pathname.startsWith("/fr/") ? "fr" : "en";
}

function pathForLang(lang: Lang): string {
  return lang === "fr" ? "/fr" : "/";
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() =>
    typeof window === "undefined" ? "en" : detectInitialLang(window.location.pathname),
  );

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // Keep language in sync with the URL on back/forward navigation.
  useEffect(() => {
    const onPop = () => setLangState(detectInitialLang(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const setLang = useCallback((next: Lang) => {
    if (typeof window !== "undefined") {
      // Record the explicit choice so the first-visit redirect honours it.
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
      const target = pathForLang(next);
      if (window.location.pathname !== target) {
        // Reflect the language in the URL (shareable + reload-safe) without a
        // full reload — React simply re-renders in the new language.
        window.history.pushState(null, "", target + window.location.hash);
      }
    }
    setLangState(next);
  }, []);

  return (
    <LangContext.Provider value={{ lang, setLang }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used within LangProvider");
  return ctx;
}
