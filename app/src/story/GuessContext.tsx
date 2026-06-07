import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Holds the reader's committed guess for "how many positions can Pogo reach?"
 * (set in chapter IV by GuessReachable). The wrong-answer slam reads it back
 * so the ×50 reveal lands on the reader's OWN number, not only on the AI's.
 */
interface GuessValue {
  guess: number | null;
  setGuess: (n: number) => void;
}

const GuessContext = createContext<GuessValue | null>(null);

export function GuessProvider({ children }: { children: ReactNode }) {
  const [guess, setGuess] = useState<number | null>(null);
  return (
    <GuessContext.Provider value={{ guess, setGuess }}>
      {children}
    </GuessContext.Provider>
  );
}

/** Tolerates a missing provider (returns a no-op) so a component can read the
 *  guess without crashing if it is ever rendered outside the story tree. */
export function useGuess(): GuessValue {
  return useContext(GuessContext) ?? { guess: null, setGuess: () => {} };
}
