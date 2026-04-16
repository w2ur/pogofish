import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AILevel } from "../ai/player";
import { type RuleSet, RULES_LC1_2, RULES_LC3_29 } from "../engine/types";

export type GameVariant = "sudden-death" | "classic";

interface SettingsContextValue {
  theme: "dark" | "light";
  analysisEnabled: boolean;
  aiLevel: AILevel;
  mctsSimulations: number;
  variant: GameVariant;
  ruleSet: RuleSet;
  setTheme: (theme: "dark" | "light") => void;
  toggleAnalysis: () => void;
  setAILevel: (level: AILevel) => void;
  setMctsSimulations: (n: number) => void;
  setVariant: (variant: GameVariant) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function getSystemTheme(): "dark" | "light" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: "dark" | "light"): void {
  if (theme === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<"dark" | "light">(getSystemTheme);
  const [analysisEnabled, setAnalysisEnabled] = useState(false);
  const [aiLevel, setAILevelState] = useState<AILevel>("alphazero");
  const [mctsSimulations, setMctsSimulationsState] = useState(50);
  const [variant, setVariantState] = useState<GameVariant>("sudden-death");

  const ruleSet = useMemo<RuleSet>(
    () => (variant === "sudden-death" ? RULES_LC1_2 : RULES_LC3_29),
    [variant],
  );

  // Apply initial theme
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Listen for system preference changes
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      const next = e.matches ? "dark" : "light";
      setThemeState(next);
      applyTheme(next);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const setTheme = useCallback((next: "dark" | "light") => {
    setThemeState(next);
    applyTheme(next);
  }, []);

  const toggleAnalysis = useCallback(() => {
    setAnalysisEnabled((prev) => !prev);
  }, []);

  const setAILevel = useCallback((level: AILevel) => {
    setAILevelState(level);
  }, []);

  const setMctsSimulations = useCallback((n: number) => {
    setMctsSimulationsState(n);
  }, []);

  const setVariant = useCallback((v: GameVariant) => {
    setVariantState(v);
  }, []);

  return (
    <SettingsContext.Provider
      value={{
        theme,
        analysisEnabled,
        aiLevel,
        mctsSimulations,
        variant,
        ruleSet,
        setTheme,
        toggleAnalysis,
        setAILevel,
        setMctsSimulations,
        setVariant,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
