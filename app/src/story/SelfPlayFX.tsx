import { useEffect, useState } from "react";
import { Board as AnimatedBoard } from "./stage/Board";
import { TRACKED_FRAMES } from "./stage/pieces";

/**
 * Beat VIII visual: two boards play out the same opening one move apart,
 * representing AlphaZero's self-play loop — current best vs challenger.
 * The persistent stage hides during this beat (handled by beatToStageView).
 *
 * A small counter ticks games-played; both boards loop their frame indices
 * through the 12-move sequence at a steady cadence.
 */

const FRAME_COUNT = TRACKED_FRAMES.length;
const TICK_MS = 720;

export function SelfPlayFX({ sub }: { sub: number }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setT((x) => x + 1), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const opacity = Math.min(1, Math.max(0, (sub - 0.1) / 0.4));
  const leftFrame = t % FRAME_COUNT;
  const rightFrame = (t + 1) % FRAME_COUNT; // one move ahead

  // Game counter that increments on each full loop, scaled by sub progression.
  const gamesPlayed = Math.min(10000, Math.floor(t * 18 + sub * 2400 + 480));

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[12] flex flex-col items-center justify-center"
      style={{ opacity }}
    >
      <div className="flex items-center gap-[clamp(24px,5vw,80px)]">
        <div className="flex flex-col items-center gap-3">
          <div className="mono text-[10px] tracking-[0.32em] uppercase text-paper-3">
            champion
          </div>
          <div style={{ width: "min(28vmin, 280px)", height: "min(28vmin, 280px)" }}>
            <AnimatedBoard
              frameIdx={leftFrame}
              mode="standard"
              glow={0.35}
              instant
              className="w-full h-full"
            />
          </div>
          <div className="mono text-[10px] tracking-[0.28em] text-vermilion">W</div>
        </div>

        {/* connector arrows + label */}
        <div className="flex flex-col items-center gap-2">
          <div className="display italic text-vermilion text-[clamp(2rem,4vw,3.4rem)] leading-none animate-pulse">
            ⇄
          </div>
          <div className="mono text-[10px] tracking-[0.34em] uppercase text-paper-3 max-w-[12ch] text-center">
            self-play
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          <div className="mono text-[10px] tracking-[0.32em] uppercase text-paper-3">
            challenger
          </div>
          <div style={{ width: "min(28vmin, 280px)", height: "min(28vmin, 280px)" }}>
            <AnimatedBoard
              frameIdx={rightFrame}
              mode="standard"
              glow={0.35}
              instant
              className="w-full h-full"
            />
          </div>
          <div className="mono text-[10px] tracking-[0.28em] text-vermilion">R</div>
        </div>
      </div>

      {/* games-played counter */}
      <div className="mt-10 mono text-[10px] tracking-[0.4em] uppercase text-paper-3 flex items-center gap-3">
        <span>games</span>
        <span className="text-vermilion text-[16px] tabular-nums tracking-[0.18em]">
          {gamesPlayed.toLocaleString("en-US")}
        </span>
        <span className="text-paper-3">/</span>
        <span className="text-paper-3 tabular-nums">10,000</span>
      </div>
    </div>
  );
}
