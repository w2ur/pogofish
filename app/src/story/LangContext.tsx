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

export function detectInitialLang(
  stored: string | null,
  navLanguage: string | undefined,
): Lang {
  if (stored === "en" || stored === "fr") return stored;
  return navLanguage && navLanguage.startsWith("fr") ? "fr" : "en";
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    if (typeof window === "undefined") return "en";
    return detectInitialLang(
      window.localStorage.getItem(LANG_STORAGE_KEY),
      navigator.language,
    );
  });

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    window.localStorage.setItem(LANG_STORAGE_KEY, next);
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
