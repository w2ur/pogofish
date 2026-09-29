import { useCallback, useEffect, useRef, useState } from "react";
import { Board } from "../components/board/Board";
import { useAI } from "../hooks/useAI";
import { useGameMachine } from "../hooks/useGameMachine";
import { RULES_LC1_2, type Player } from "../engine/types";
import { DEFAULT_LEVEL, LEVEL_SIMS, isChange, shouldPulse, type Lang, type Level } from "./embed";
import { STRINGS } from "./strings";

const RULES = RULES_LC1_2;
const LEVELS: readonly Level[] = ["easy", "normal", "hard"];

interface SessionProps {
  colour: Player;
  level: Level;
  lang: Lang;
  ai: ReturnType<typeof useAI>;
  netReady: boolean;
  onNetReady: () => void;
}

function Session({ colour, level, lang, ai, netReady, onNetReady }: SessionProps) {
  const t = STRINGS[lang];
  const { state, dispatch, isPlayerTurn, gameOver, gameWinner } = useGameMachine(colour, RULES);
  const [failed, setFailed] = useState(false);

  const stateRef = useRef(state);
  stateRef.current = state;
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (isPlayerTurn || gameOver || inFlight.current || failed) return;
    inFlight.current = true;
    dispatch({ type: "AI_MOVE_REQUESTED" });
    const started = Date.now();
    ai.requestMove(stateRef.current.gameState, {
      level: "alphazero-mcts",
      mctsSimulations: LEVEL_SIMS[level],
      ruleSet: RULES,
    })
      .then(async (move) => {
        const elapsed = Date.now() - started;
        if (elapsed < 400) await new Promise((r) => setTimeout(r, 400 - elapsed));
        if (!mounted.current) return;
        onNetReady();
        dispatch({ type: "AI_MOVE_RECEIVED", move });
      })
      .catch(() => {
        if (mounted.current) setFailed(true);
      })
      .finally(() => {
        inFlight.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlayerTurn, gameOver, failed]);

  const thinking = state.aiStatus === "thinking";
  let status = "";
  if (failed) status = t.failed;
  else if (gameOver) status = gameWinner === colour ? t.youWin : t.youLose;
  else if (thinking) status = netReady ? t.thinking : t.loading;
  else if (isPlayerTurn) status = t.yourTurn;

  const select = useCallback(
    (cellIndex: number) =>
      dispatch({ type: "SELECT_CELL", cellIndex, playerColor: colour, ruleSet: RULES }),
    [dispatch, colour],
  );

  return (
    <>
      <p
        role="status"
        className={`m-0 mb-3 min-h-5 text-center text-sm text-paper ${shouldPulse(thinking, failed) ? "animate-pulse" : ""}`}
      >
        {status}
      </p>
      <div className="bd-board">
        <Board
          state={state.gameState}
          selection={state.selection}
          lastMove={state.lastMove}
          bestMoveCell={null}
          onSelectCell={select}
          onSelectDestination={(toCell) => dispatch({ type: "SELECT_DESTINATION", toCell })}
          onSelectCount={(numPieces) => dispatch({ type: "SELECT_COUNT", numPieces })}
        />
      </div>
    </>
  );
}

export function BoardApp({ lang }: { lang: Lang }) {
  const t = STRINGS[lang];
  const ai = useAI();
  const [colour, setColour] = useState<Player>("W");
  const [level, setLevel] = useState<Level>(DEFAULT_LEVEL);
  const [sessionKey, setSessionKey] = useState(0);
  const [netReady, setNetReady] = useState(false);

  const restart = useCallback(() => setSessionKey((k) => k + 1), []);

  return (
    <main className="mx-auto flex h-full w-full max-w-[720px] flex-col px-4 pb-3 pt-3">
      <header className="mb-2 flex items-center justify-between gap-3">
        <h1 className="m-0 text-lg font-semibold">{t.title}</h1>
        <button type="button" className="bd-btn" onClick={restart}>
          {t.newGame}
        </button>
      </header>

      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-sm text-paper-2">
        <span className="min-w-[4.5rem]">{t.youPlay}</span>
        {(["W", "R"] as const).map((c) => (
          <button
            key={c}
            type="button"
            className="bd-btn"
            aria-pressed={colour === c}
            onClick={() => {
              if (!isChange(colour, c)) return;
              setColour(c);
              restart();
            }}
          >
            {c === "W" ? t.white : t.red}
          </button>
        ))}
      </div>

      <div className="mb-1 flex flex-wrap items-center gap-2 text-sm text-paper-2">
        <span className="min-w-[4.5rem]">{t.level}</span>
        {LEVELS.map((l) => (
          <button
            key={l}
            type="button"
            className="bd-btn"
            aria-pressed={level === l}
            onClick={() => {
              if (!isChange(level, l)) return;
              setLevel(l);
              restart();
            }}
          >
            {t.levels[l]}
          </button>
        ))}
      </div>
      <p className="m-0 mb-3 text-xs leading-snug text-paper-3">{t.levelNote}</p>

      <Session
        key={sessionKey}
        colour={colour}
        level={level}
        lang={lang}
        ai={ai}
        netReady={netReady}
        onNetReady={() => setNetReady(true)}
      />
    </main>
  );
}
