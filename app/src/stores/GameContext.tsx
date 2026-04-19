import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

interface GameContextValue {
  playerColor: "W" | "R";
  setPlayerColor: (color: "W" | "R") => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [playerColor, setPlayerColorState] = useState<"W" | "R">("W");

  const setPlayerColor = useCallback((color: "W" | "R") => {
    setPlayerColorState(color);
  }, []);

  return (
    <GameContext.Provider value={{ playerColor, setPlayerColor }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGameContext(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGameContext must be used within GameProvider");
  return ctx;
}
