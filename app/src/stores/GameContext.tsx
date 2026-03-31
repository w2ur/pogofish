import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

export type View = "home" | "game" | "journey" | "about";

interface GameContextValue {
  view: View;
  playerColor: "W" | "R";
  setView: (view: View) => void;
  setPlayerColor: (color: "W" | "R") => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [view, setViewState] = useState<View>("home");
  const [playerColor, setPlayerColorState] = useState<"W" | "R">("W");

  const setView = useCallback((next: View) => {
    setViewState(next);
  }, []);

  const setPlayerColor = useCallback((color: "W" | "R") => {
    setPlayerColorState(color);
  }, []);

  return (
    <GameContext.Provider value={{ view, playerColor, setView, setPlayerColor }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGameContext(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGameContext must be used within GameProvider");
  return ctx;
}
